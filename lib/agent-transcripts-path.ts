import fs from "fs";
import os from "os";
import path from "path";

function getHomeDir(): string {
  return os.platform() === "win32"
    ? process.env.USERPROFILE || os.homedir()
    : process.env.HOME || os.homedir();
}

/**
 * WSL: Windows profile dirs that may hold Cursor transcripts.
 * Prefer the current user (USERPROFILE / common env) — scanning every
 * /mnt/c/Users/* on every index rebuild is very slow on 9p mounts.
 */
function windowsUserDirs(): string[] {
  const dirs: string[] = [];
  const seen = new Set<string>();
  const push = (dir: string | null | undefined) => {
    if (!dir) return;
    const resolved = path.resolve(dir);
    if (seen.has(resolved)) return;
    try {
      if (!fs.statSync(resolved).isDirectory()) return;
    } catch {
      return;
    }
    seen.add(resolved);
    dirs.push(resolved);
  };

  const profile =
    process.env.USERPROFILE ||
    (process.env.HOMEDRIVE && process.env.HOMEPATH
      ? `${process.env.HOMEDRIVE}${process.env.HOMEPATH}`
      : "");
  if (profile) {
    // USERPROFILE is like C:\Users\Name — map to /mnt/c/Users/Name on WSL.
    const mnt = profile
      .replace(/^([A-Za-z]):\\/, (_, d: string) => `/mnt/${d.toLowerCase()}/`)
      .replace(/\\/g, "/");
    push(mnt);
    push(profile);
  }

  // Prefer profiles that actually have Cursor project transcripts.
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
      const userDir = path.join(usersRoot, name);
      const projects = path.join(userDir, ".cursor", "projects");
      try {
        if (fs.statSync(projects).isDirectory()) push(userDir);
      } catch {
        // no Cursor projects for this profile
      }
    }
  } catch {
    // not on WSL / no mount
  }

  return dirs;
}

/** 显式指定单根目录时优先（兼容旧配置） */
function getConfiguredTranscriptRoot(): string | null {
  return (
    process.env.AGENT_TRANSCRIPTS_PATH ||
    process.env.CURSOR_AGENT_TRANSCRIPTS_PATH ||
    null
  );
}

function collectTranscriptRootsUnder(projectsRoot: string, into: string[]): void {
  if (!fs.existsSync(projectsRoot)) return;
  try {
    for (const name of fs.readdirSync(projectsRoot)) {
      const candidate = path.join(projectsRoot, name, "agent-transcripts");
      try {
        if (fs.statSync(candidate).isDirectory()) into.push(candidate);
      } catch {
        // skip
      }
    }
  } catch {
    // skip unreadable projects root
  }
}

function listTranscriptRoots(): string[] {
  const configured = getConfiguredTranscriptRoot();
  if (configured) return [configured];

  const roots: string[] = [];
  const seen = new Set<string>();
  const addFrom = (projectsRoot: string) => {
    const batch: string[] = [];
    collectTranscriptRootsUnder(projectsRoot, batch);
    for (const root of batch) {
      const key = path.resolve(root);
      if (seen.has(key)) continue;
      seen.add(key);
      roots.push(root);
    }
  };

  addFrom(path.join(getHomeDir(), ".cursor", "projects"));
  // Windows Cursor sessions (opened via \\wsl$\... or drive letter) store
  // transcripts under %USERPROFILE%\.cursor\projects, not Linux ~/.cursor.
  for (const userDir of windowsUserDirs()) {
    addFrom(path.join(userDir, ".cursor", "projects"));
  }
  return roots;
}

let cachedRoots: string[] | null = null;
let cachedRootsAt = 0;
const ROOTS_TTL_MS = 60_000;

function getTranscriptRoots(): string[] {
  const now = Date.now();
  if (cachedRoots && now - cachedRootsAt < ROOTS_TTL_MS) return cachedRoots;
  cachedRoots = listTranscriptRoots();
  cachedRootsAt = now;
  return cachedRoots;
}

export type TranscriptKind = "main" | "subagent";

export type ResolvedTranscript = {
  path: string;
  kind: TranscriptKind;
  /** Present when kind is subagent (parent session folder name). */
  parentSessionId?: string;
};

/** sessionId → resolved transcript（命中缓存；短负缓存避免同一次 list 重建反复扫盘） */
const pathCache = new Map<string, ResolvedTranscript>();
const negativePathCache = new Map<string, number>();
const NEGATIVE_TTL_MS = 5_000;

type TranscriptIndex = {
  byId: Map<string, ResolvedTranscript>;
  byParent: Map<string, string[]>;
  signature: string;
  builtAt: number;
};

let transcriptIndex: TranscriptIndex | null = null;
const INDEX_TTL_MS = 60_000;
/** At most one forced miss-rebuild per window — avoid N full /mnt/c scans per list rebuild. */
const INDEX_MISS_REBUILD_MS = 15_000;
let lastForcedIndexRebuildAt = 0;

function rootsSignature(roots: string[]): string {
  return roots
    .map((root) => {
      try {
        const st = fs.statSync(root);
        const n = fs.readdirSync(root).length;
        return `${root}:${st.mtimeMs}:${n}`;
      } catch {
        return `${root}:missing`;
      }
    })
    .join("|");
}

function buildTranscriptIndex(roots: string[]): Omit<TranscriptIndex, "signature" | "builtAt"> {
  const byId = new Map<string, ResolvedTranscript>();
  const byParent = new Map<string, string[]>();

  for (const root of roots) {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(root, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const ent of entries) {
      if (!ent.isDirectory()) continue;
      const parentId = ent.name;

      const mainPath = path.join(root, parentId, `${parentId}.jsonl`);
      try {
        if (fs.statSync(mainPath).size > 0 && !byId.has(parentId)) {
          byId.set(parentId, { path: mainPath, kind: "main" });
        }
      } catch {
        // no main transcript
      }

      const subDir = path.join(root, parentId, "subagents");
      let subNames: string[];
      try {
        subNames = fs.readdirSync(subDir);
      } catch {
        continue;
      }

      const childIds: string[] = byParent.get(parentId) ?? [];
      for (const name of subNames) {
        if (!/\.jsonl$/i.test(name)) continue;
        const id = name.replace(/\.jsonl$/i, "");
        if (!id) continue;
        const subPath = path.join(subDir, name);
        try {
          if (fs.statSync(subPath).size <= 0) continue;
        } catch {
          continue;
        }
        const existing = byId.get(id);
        // Prefer an existing main transcript over a colliding subagent path.
        if (existing?.kind === "main") continue;
        byId.set(id, {
          path: subPath,
          kind: "subagent",
          parentSessionId: parentId,
        });
        childIds.push(id);
      }
      if (childIds.length > 0) byParent.set(parentId, childIds);
    }
  }

  return { byId, byParent };
}

function getTranscriptIndex(force = false): TranscriptIndex {
  const now = Date.now();
  // Trust the in-memory index for the TTL window — do NOT re-stat every
  // transcript root on each resolveTranscript call (list rebuilds resolve
  // thousands of ids; root signatures are expensive on /mnt/c).
  if (
    !force &&
    transcriptIndex &&
    now - transcriptIndex.builtAt < INDEX_TTL_MS
  ) {
    return transcriptIndex;
  }

  const roots = getTranscriptRoots();
  const signature = rootsSignature(roots);
  if (
    !force &&
    transcriptIndex &&
    transcriptIndex.signature === signature
  ) {
    transcriptIndex.builtAt = now;
    return transcriptIndex;
  }

  const built = buildTranscriptIndex(roots);
  transcriptIndex = {
    ...built,
    signature,
    builtAt: now,
  };
  pathCache.clear();
  negativePathCache.clear();
  for (const [id, resolved] of built.byId) {
    pathCache.set(id, resolved);
  }
  return transcriptIndex;
}

function tryMainTranscript(root: string, sessionId: string): ResolvedTranscript | null {
  const transcriptPath = path.join(root, sessionId, `${sessionId}.jsonl`);
  try {
    if (fs.existsSync(transcriptPath) && fs.statSync(transcriptPath).size > 0) {
      return { path: transcriptPath, kind: "main" };
    }
  } catch {
    // continue
  }
  return null;
}

/**
 * 在所有 Cursor 项目的 agent-transcripts 中查找会话文件。
 * 主会话：`<sessionId>/<sessionId>.jsonl`
 * 子代理：`<parentSessionId>/subagents/<sessionId>.jsonl`
 *
 * Uses a one-pass directory index (O(files)) instead of per-id nested readdir.
 */
export function resolveTranscript(sessionId: string): ResolvedTranscript | null {
  if (!sessionId) return null;
  const cached = pathCache.get(sessionId);
  if (cached) return cached;
  const negUntil = negativePathCache.get(sessionId);
  if (negUntil && Date.now() < negUntil) return null;

  const index = getTranscriptIndex();
  const indexed = index.byId.get(sessionId);
  if (indexed) {
    pathCache.set(sessionId, indexed);
    return indexed;
  }

  const indexAge = Date.now() - index.builtAt;
  // A freshly built index already walked every transcript file — do not probe
  // all roots again for each miss (session list resolves thousands of ids).
  if (indexAge < INDEX_MISS_REBUILD_MS) {
    negativePathCache.set(sessionId, Date.now() + NEGATIVE_TTL_MS);
    return null;
  }

  // Cheap main-path probe for sessions created after the last index build.
  for (const root of getTranscriptRoots()) {
    const main = tryMainTranscript(root, sessionId);
    if (main) {
      pathCache.set(sessionId, main);
      getTranscriptIndex().byId.set(sessionId, main);
      return main;
    }
  }

  // Subagent files live in nested dirs; allow one forced rebuild per window when
  // the root signature may not reflect nested writes — not once per miss id.
  const now = Date.now();
  if (now - lastForcedIndexRebuildAt >= INDEX_MISS_REBUILD_MS) {
    lastForcedIndexRebuildAt = now;
    const again = getTranscriptIndex(true).byId.get(sessionId);
    if (again) {
      pathCache.set(sessionId, again);
      return again;
    }
  }

  negativePathCache.set(sessionId, Date.now() + NEGATIVE_TTL_MS);
  return null;
}

/**
 * 在所有 Cursor 项目的 agent-transcripts 中查找会话文件。
 * 会话发生在哪个工作区，transcript 就落在对应 projects/<slug>/ 下；
 * 不能写死某一个项目目录（例如改名后的 cursor-learn-english）。
 */
export function resolveTranscriptPath(sessionId: string): string | null {
  return resolveTranscript(sessionId)?.path ?? null;
}

export function hasSessionTranscript(sessionId: string): boolean {
  return resolveTranscriptPath(sessionId) != null;
}

/** List subagent conversation ids under `<parent>/subagents/*.jsonl`. */
export function listSubagentIdsForParent(parentSessionId: string): string[] {
  if (!parentSessionId) return [];
  const fromIndex = getTranscriptIndex().byParent.get(parentSessionId);
  if (fromIndex && fromIndex.length > 0) return [...fromIndex];

  // Fallback for brand-new parents not yet in the index.
  const ids = new Set<string>();
  for (const root of getTranscriptRoots()) {
    const dir = path.join(root, parentSessionId, "subagents");
    try {
      for (const name of fs.readdirSync(dir)) {
        if (!/\.jsonl$/i.test(name)) continue;
        const id = name.replace(/\.jsonl$/i, "");
        if (id) ids.add(id);
      }
    } catch {
      // skip missing parent /subagents dirs
    }
  }
  return Array.from(ids);
}

/** 测试或路径变更后可调用 */
export function clearTranscriptPathCache(): void {
  pathCache.clear();
  negativePathCache.clear();
  transcriptIndex = null;
  cachedRoots = null;
  cachedRootsAt = 0;
  lastForcedIndexRebuildAt = 0;
}
