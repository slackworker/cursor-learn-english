import fs from "fs";
import { getEventsPath, type CursorEvent } from "../events";
import {
  getMergedReadSignature,
  resolveReadPaths,
} from "../jsonl-daily";
import {
  getSessionIdFromEvent,
  getSubagentSessionId,
} from "./ids";

/** conversation ids that ever emitted sessionStart / subagentStart (unfiltered corpus). */
let globalLifecycleStarts: {
  sessionStart: Set<string>;
  subagentStart: Set<string>;
} | null = null;
let globalLifecycleStartSignature = "";
let globalLifecycleStartsBuiltAt = 0;
/** Serve briefly-stale global starts while today's events JSONL keeps appending. */
const LIFECYCLE_STARTS_SOFT_STALE_MS = 60_000;

type LifecycleStartHit = { kind: "sessionStart" | "subagentStart"; id: string };

type LifecycleFileCacheEntry = {
  mtimeMs: number;
  size: number;
  sessionStart: Set<string>;
  subagentStart: Set<string>;
};

/** Per-file start-id sets — only re-parse a shard when it changes (not the full corpus). */
const lifecycleFileCache = new Map<string, LifecycleFileCacheEntry>();

/**
 * Extract only sessionStart / subagentStart ids from a line.
 * Cheap reject avoids JSON.parse on the vast majority of event rows.
 */
function parseLifecycleStartLine(line: string): LifecycleStartHit | null {
  if (!line.includes("sessionStart") && !line.includes("subagentStart")) {
    return null;
  }
  try {
    const event = JSON.parse(line) as CursorEvent;
    if (event.event_type === "sessionStart") {
      const id = getSessionIdFromEvent(event);
      return id ? { kind: "sessionStart", id } : null;
    }
    if (event.event_type === "subagentStart") {
      const id = getSubagentSessionId(event);
      return id ? { kind: "subagentStart", id } : null;
    }
  } catch {
    // ignore malformed
  }
  return null;
}

function readLifecycleStartsFromFile(filePath: string): {
  sessionStart: Set<string>;
  subagentStart: Set<string>;
} {
  let st: fs.Stats;
  try {
    st = fs.statSync(filePath);
  } catch {
    return { sessionStart: new Set(), subagentStart: new Set() };
  }

  const hit = lifecycleFileCache.get(filePath);
  if (hit && hit.mtimeMs === st.mtimeMs && hit.size === st.size) {
    return { sessionStart: hit.sessionStart, subagentStart: hit.subagentStart };
  }

  const sessionStart = new Set<string>(hit?.sessionStart);
  const subagentStart = new Set<string>(hit?.subagentStart);

  // Append-only fast path: keep prior ids and scan only the new tail.
  let offset = 0;
  if (hit && st.size > hit.size) {
    offset = hit.size;
  } else {
    sessionStart.clear();
    subagentStart.clear();
  }

  const fd = fs.openSync(filePath, "r");
  try {
    const buf = Buffer.alloc(st.size - offset);
    if (buf.length > 0) {
      fs.readSync(fd, buf, 0, buf.length, offset);
      for (const line of buf.toString("utf-8").split("\n")) {
        if (!line.trim()) continue;
        const parsed = parseLifecycleStartLine(line);
        if (!parsed) continue;
        if (parsed.kind === "sessionStart") sessionStart.add(parsed.id);
        else subagentStart.add(parsed.id);
      }
    }
  } finally {
    fs.closeSync(fd);
  }

  lifecycleFileCache.set(filePath, {
    mtimeMs: st.mtimeMs,
    size: st.size,
    sessionStart,
    subagentStart,
  });
  return { sessionStart, subagentStart };
}

export function getGlobalLifecycleStarts(): {
  sessionStart: Set<string>;
  subagentStart: Set<string>;
} {
  const signature = getMergedReadSignature(getEventsPath());
  if (globalLifecycleStarts && globalLifecycleStartSignature === signature) {
    return globalLifecycleStarts;
  }
  if (
    globalLifecycleStarts &&
    Date.now() - globalLifecycleStartsBuiltAt < LIFECYCLE_STARTS_SOFT_STALE_MS
  ) {
    return globalLifecycleStarts;
  }

  const sessionStart = new Set<string>();
  const subagentStart = new Set<string>();
  // Per-shard extract: when only today grows, older days stay cached.
  for (const filePath of resolveReadPaths(getEventsPath())) {
    const part = readLifecycleStartsFromFile(filePath);
    for (const id of part.sessionStart) sessionStart.add(id);
    for (const id of part.subagentStart) subagentStart.add(id);
  }

  globalLifecycleStarts = { sessionStart, subagentStart };
  globalLifecycleStartSignature = signature;
  globalLifecycleStartsBuiltAt = Date.now();
  return globalLifecycleStarts;
}

export function getGlobalSessionStartIds(): Set<string> {
  return getGlobalLifecycleStarts().sessionStart;
}

export function getGlobalSubagentStartIds(): Set<string> {
  return getGlobalLifecycleStarts().subagentStart;
}

/** Test-only / summaries cache clear. */
export function clearLifecycleStartsCache(): void {
  globalLifecycleStarts = null;
  globalLifecycleStartSignature = "";
  globalLifecycleStartsBuiltAt = 0;
  lifecycleFileCache.clear();
}
