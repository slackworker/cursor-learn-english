import { execFileSync } from "child_process";
import fs from "fs";
import path from "path";
import { getHomeDir } from "./default-paths";

const STATE_DB = "state.vscdb";
const SEARCH_DB = "conversation-search.db";
const CACHE_TTL_MS = 15_000;

type TitleCache = {
  signature: string;
  titles: Map<string, string>;
  loadedAt: number;
};

let titleCache: TitleCache | null = null;
let resolvedStateDbPath: string | null | undefined;
let resolvedSearchDbPath: string | null | undefined;

function pushUnique(out: string[], value: string | null | undefined): void {
  if (!value) return;
  const normalized = path.resolve(value);
  if (!out.includes(normalized)) out.push(normalized);
}

function windowsUserDirs(): string[] {
  const dirs: string[] = [];
  try {
    const usersRoot = "/mnt/c/Users";
    for (const name of fs.readdirSync(usersRoot)) {
      if (
        name === "Public" ||
        name === "Default" ||
        name === "Default User" ||
        name === "All Users" ||
        name.startsWith(".")
      ) {
        continue;
      }
      dirs.push(path.join(usersRoot, name));
    }
  } catch {
    // not on WSL
  }
  return dirs;
}

function candidateGlobalStorageFiles(basename: string): string[] {
  const out: string[] = [];
  const home = getHomeDir();

  if (basename === STATE_DB) {
    pushUnique(out, process.env.CURSOR_STATE_VSCDB);
    pushUnique(out, process.env.STATE_VSCDB_PATH);
  } else {
    pushUnique(out, process.env.CURSOR_CONVERSATION_SEARCH_DB);
    pushUnique(out, process.env.CONVERSATION_SEARCH_DB_PATH);
  }

  if (process.env.APPDATA) {
    pushUnique(
      out,
      path.join(process.env.APPDATA, "Cursor", "User", "globalStorage", basename)
    );
  }

  pushUnique(
    out,
    path.join(home, "AppData", "Roaming", "Cursor", "User", "globalStorage", basename)
  );
  pushUnique(
    out,
    path.join(home, ".config", "Cursor", "User", "globalStorage", basename)
  );

  for (const userDir of windowsUserDirs()) {
    pushUnique(
      out,
      path.join(
        userDir,
        "AppData",
        "Roaming",
        "Cursor",
        "User",
        "globalStorage",
        basename
      )
    );
  }

  return out;
}

function newestExisting(candidates: string[]): string | null {
  let best: { path: string; mtimeMs: number } | null = null;
  for (const candidate of candidates) {
    try {
      const st = fs.statSync(candidate);
      if (!st.isFile() || st.size <= 0) continue;
      if (!best || st.mtimeMs > best.mtimeMs) {
        best = { path: candidate, mtimeMs: st.mtimeMs };
      }
    } catch {
      // skip
    }
  }
  return best?.path ?? null;
}

export function resolveCursorStateDbPath(): string | null {
  if (resolvedStateDbPath !== undefined) return resolvedStateDbPath;
  resolvedStateDbPath = newestExisting(candidateGlobalStorageFiles(STATE_DB));
  return resolvedStateDbPath;
}

export function resolveConversationSearchDbPath(): string | null {
  if (resolvedSearchDbPath !== undefined) return resolvedSearchDbPath;
  resolvedSearchDbPath = newestExisting(candidateGlobalStorageFiles(SEARCH_DB));
  return resolvedSearchDbPath;
}

function fileSignature(filePath: string): string {
  try {
    const st = fs.statSync(filePath);
    let sig = `${filePath}:${st.mtimeMs}:${st.size}`;
    for (const ext of ["-wal", "-shm"]) {
      try {
        const side = fs.statSync(filePath + ext);
        sig += `|${ext}:${side.mtimeMs}:${side.size}`;
      } catch {
        // no side file
      }
    }
    return sig;
  } catch {
    return `${filePath}:missing`;
  }
}

/**
 * Next.js/Turbopack cannot reliably load node:sqlite, so read via python3.
 * Uses immutable URI so WSL can read while Cursor holds the live DB.
 */
function querySqliteJsonRows(
  dbPath: string,
  sql: string,
  params: unknown[] = []
): Array<Record<string, unknown>> {
  const script = `
import json, sqlite3, sys
db_path = sys.argv[1]
sql = sys.argv[2]
params = json.loads(sys.argv[3])
con = sqlite3.connect(f"file:{db_path}?mode=ro&immutable=1", uri=True)
con.row_factory = sqlite3.Row
try:
    rows = con.execute(sql, params).fetchall()
    print(json.dumps([dict(r) for r in rows], ensure_ascii=False))
except Exception as e:
    print(json.dumps({"__error__": str(e)}), file=sys.stderr)
    raise
finally:
    con.close()
`;
  const stdout = execFileSync(
    "python3",
    ["-c", script, dbPath, sql, JSON.stringify(params)],
    {
      encoding: "utf8",
      maxBuffer: 32 * 1024 * 1024,
      timeout: 20_000,
    }
  );
  const parsed = JSON.parse(stdout) as
    | Array<Record<string, unknown>>
    | { __error__?: string };
  if (!Array.isArray(parsed)) {
    throw new Error(parsed.__error__ || "sqlite query failed");
  }
  return parsed;
}

function loadComposerHeaderTitles(stateDbPath: string): Map<string, string> {
  const titles = new Map<string, string>();
  const rows = querySqliteJsonRows(
    stateDbPath,
    `SELECT composerId AS id,
            trim(COALESCE(json_extract(value, '$.name'), '')) AS title
     FROM composerHeaders
     WHERE trim(COALESCE(json_extract(value, '$.name'), '')) != ''`
  );
  for (const row of rows) {
    const id = typeof row.id === "string" ? row.id.trim() : "";
    const title = typeof row.title === "string" ? row.title.trim() : "";
    if (id && title) titles.set(id, title);
  }
  return titles;
}

function loadConversationSearchTitles(searchDbPath: string): Map<string, string> {
  const titles = new Map<string, string>();
  const rows = querySqliteJsonRows(
    searchDbPath,
    "SELECT id, title FROM conversations WHERE trim(title) != ?",
    [""]
  );
  for (const row of rows) {
    const id = typeof row.id === "string" ? row.id.trim() : "";
    const title = typeof row.title === "string" ? row.title.trim() : "";
    if (id && title) titles.set(id, title);
  }
  return titles;
}

function ensureTitleCache(): Map<string, string> | null {
  const statePath = resolveCursorStateDbPath();
  const searchPath = resolveConversationSearchDbPath();
  if (!statePath && !searchPath) return null;

  const signature = [
    statePath ? fileSignature(statePath) : "state:none",
    searchPath ? fileSignature(searchPath) : "search:none",
  ].join("||");
  const now = Date.now();
  if (
    titleCache &&
    titleCache.signature === signature &&
    now - titleCache.loadedAt < CACHE_TTL_MS
  ) {
    return titleCache.titles;
  }

  const titles = new Map<string, string>();
  try {
    if (statePath) {
      for (const [id, title] of loadComposerHeaderTitles(statePath)) {
        titles.set(id, title);
      }
    }
    if (searchPath) {
      try {
        for (const [id, title] of loadConversationSearchTitles(searchPath)) {
          if (!titles.has(id)) titles.set(id, title);
        }
      } catch {
        // search db is secondary; composer headers are enough
      }
    }
    titleCache = { signature, titles, loadedAt: now };
    return titles;
  } catch {
    if (titleCache?.titles) return titleCache.titles;
    return null;
  }
}

/**
 * Cursor sidebar titles keyed by composer / agent session UUID.
 * Prefer state.vscdb composerHeaders.name (live), then conversation-search.db.
 */
export function getCursorConversationTitles(
  sessionIds: string[]
): Map<string, string> {
  const result = new Map<string, string>();
  if (sessionIds.length === 0) return result;
  const all = ensureTitleCache();
  if (!all) return result;
  for (const id of sessionIds) {
    if (!id) continue;
    const title = all.get(id);
    if (title) result.set(id, title);
  }
  return result;
}

/** Test-only / path override after env change. */
export function clearCursorConversationTitleCache(): void {
  titleCache = null;
  resolvedStateDbPath = undefined;
  resolvedSearchDbPath = undefined;
}
