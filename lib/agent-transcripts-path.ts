import fs from "fs";
import os from "os";
import path from "path";

function getHomeDir(): string {
  return os.platform() === "win32"
    ? process.env.USERPROFILE || os.homedir()
    : process.env.HOME || os.homedir();
}

/** 显式指定单根目录时优先（兼容旧配置） */
function getConfiguredTranscriptRoot(): string | null {
  return (
    process.env.AGENT_TRANSCRIPTS_PATH ||
    process.env.CURSOR_AGENT_TRANSCRIPTS_PATH ||
    null
  );
}

function listTranscriptRoots(): string[] {
  const configured = getConfiguredTranscriptRoot();
  if (configured) return [configured];

  const projectsRoot = path.join(getHomeDir(), ".cursor", "projects");
  if (!fs.existsSync(projectsRoot)) return [];

  const roots: string[] = [];
  try {
    for (const name of fs.readdirSync(projectsRoot)) {
      const candidate = path.join(projectsRoot, name, "agent-transcripts");
      try {
        if (fs.statSync(candidate).isDirectory()) roots.push(candidate);
      } catch {
        // skip
      }
    }
  } catch {
    return [];
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

/** sessionId → resolved transcript（仅缓存命中；未命中不缓存，以便文件稍后出现时能再次查找） */
const pathCache = new Map<string, ResolvedTranscript>();

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

function trySubagentTranscript(root: string, sessionId: string): ResolvedTranscript | null {
  try {
    for (const parentName of fs.readdirSync(root)) {
      const subPath = path.join(root, parentName, "subagents", `${sessionId}.jsonl`);
      try {
        if (fs.existsSync(subPath) && fs.statSync(subPath).size > 0) {
          return {
            path: subPath,
            kind: "subagent",
            parentSessionId: parentName,
          };
        }
      } catch {
        // continue
      }
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
 */
export function resolveTranscript(sessionId: string): ResolvedTranscript | null {
  if (!sessionId) return null;
  const cached = pathCache.get(sessionId);
  if (cached) return cached;

  for (const root of getTranscriptRoots()) {
    const main = tryMainTranscript(root, sessionId);
    if (main) {
      pathCache.set(sessionId, main);
      return main;
    }
  }
  for (const root of getTranscriptRoots()) {
    const sub = trySubagentTranscript(root, sessionId);
    if (sub) {
      pathCache.set(sessionId, sub);
      return sub;
    }
  }
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
  cachedRoots = null;
  cachedRootsAt = 0;
}
