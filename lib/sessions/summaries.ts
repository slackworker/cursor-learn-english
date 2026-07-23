import { getEvents, getEventsPath } from "../events";
import { getPromptCorpusPath } from "../thinking";
import {
  getMergedReadSignature,
  readMergedJsonlLinesCached,
} from "../jsonl-daily";
import { sanitizeSessionId } from "./ids";
import { clearLifecycleStartsCache } from "./lifecycle";
import { buildMainSessionSummaries } from "./main-summaries";
import {
  buildSubagentSessionSummaries,
  canonicalizeSubagentSummaries,
  mergeSubagentSummaries,
} from "./subagents";
import type {
  GetSessionSummariesOptions,
  PromptRecord,
  SessionSummary,
} from "./types";
import { parseJsonlLine, sessionSortKey } from "./util";

type SummariesCacheEntry = {
  signature: string;
  result: { sessions: SessionSummary[]; truncated: boolean };
  /** hook call-* id → canonical transcript UUID */
  aliases: Map<string, string>;
  builtAt: number;
};

const summariesCache = new Map<string, SummariesCacheEntry>();
/** Latest includeSubagents=true alias map for detail deep-links. */
let latestSubagentAliases = new Map<string, string>();
/**
 * While today's events JSONL is appending, serve a briefly-stale list instead of
 * rebuilding for multiple seconds on every poll.
 */
const SUMMARIES_SOFT_STALE_MS = 60_000;

function getSummariesCacheSignature(from?: string, to?: string): string {
  return [
    getMergedReadSignature(getEventsPath(), from, to),
    getMergedReadSignature(getPromptCorpusPath(), from, to),
  ].join("::");
}

function buildSessionSummaries(
  from?: string,
  to?: string,
  options?: GetSessionSummariesOptions
): {
  sessions: SessionSummary[];
  truncated: boolean;
  aliases: Map<string, string>;
} {
  const includeSubagents = Boolean(options?.includeSubagents);
  const { events, truncated } = getEvents(from, to);
  const { items: prompts, truncated: promptsTruncated } = readMergedJsonlLinesCached(
    getPromptCorpusPath(),
    parseJsonlLine<PromptRecord>,
    { from, to }
  );

  const { main, subagentsFromTranscript } = buildMainSessionSummaries(events, prompts);
  if (!includeSubagents) {
    return {
      sessions: main.sort((a, b) => sessionSortKey(b).localeCompare(sessionSortKey(a))),
      truncated: truncated || promptsTruncated,
      aliases: new Map(),
    };
  }

  const merged = mergeSubagentSummaries(
    buildSubagentSessionSummaries(events),
    subagentsFromTranscript
  );
  const { sessions: subagents, aliases } = canonicalizeSubagentSummaries(merged, events);
  const sessions = [...main, ...subagents].sort((a, b) =>
    sessionSortKey(b).localeCompare(sessionSortKey(a))
  );

  return { sessions, truncated: truncated || promptsTruncated, aliases };
}

function summariesCacheKey(
  from: string | undefined,
  to: string | undefined,
  includeSubagents: boolean
): string {
  return `${from ?? ""}::${to ?? ""}::sub:${includeSubagents ? 1 : 0}`;
}

function isSummariesCacheUsable(
  hit: SummariesCacheEntry | undefined,
  signature: string
): hit is SummariesCacheEntry {
  if (!hit) return false;
  if (hit.signature === signature) return true;
  return Date.now() - hit.builtAt < SUMMARIES_SOFT_STALE_MS;
}

export function getLatestSubagentAliases(): Map<string, string> {
  return latestSubagentAliases;
}

export function getSessionSummaries(
  from?: string,
  to?: string,
  options?: GetSessionSummariesOptions
): {
  sessions: SessionSummary[];
  truncated: boolean;
} {
  const includeSubagents = Boolean(options?.includeSubagents);
  const cacheKey = summariesCacheKey(from, to, includeSubagents);
  const signature = getSummariesCacheSignature(from, to);
  const hit = summariesCache.get(cacheKey);
  if (isSummariesCacheUsable(hit, signature)) {
    if (includeSubagents) latestSubagentAliases = hit.aliases;
    return hit.result;
  }

  // Prefer deriving the main-only list from a warm includeSubagents=true entry
  // so home + sessions page do not each pay for a full rebuild.
  if (!includeSubagents) {
    const fullKey = summariesCacheKey(from, to, true);
    const fullHit = summariesCache.get(fullKey);
    if (isSummariesCacheUsable(fullHit, signature)) {
      const mainOnly = {
        sessions: fullHit.result.sessions.filter((s) => !s.is_subagent),
        truncated: fullHit.result.truncated,
      };
      summariesCache.set(cacheKey, {
        signature: fullHit.signature,
        result: mainOnly,
        aliases: new Map(),
        builtAt: fullHit.builtAt,
      });
      return mainOnly;
    }
  }

  // Always build the full list once; populate both cache keys.
  const built = buildSessionSummaries(from, to, { includeSubagents: true });
  const fullResult = { sessions: built.sessions, truncated: built.truncated };
  const mainResult = {
    sessions: built.sessions.filter((s) => !s.is_subagent),
    truncated: built.truncated,
  };
  const builtAt = Date.now();
  summariesCache.set(summariesCacheKey(from, to, true), {
    signature,
    result: fullResult,
    aliases: built.aliases,
    builtAt,
  });
  summariesCache.set(summariesCacheKey(from, to, false), {
    signature,
    result: mainResult,
    aliases: new Map(),
    builtAt,
  });
  latestSubagentAliases = built.aliases;
  return includeSubagents ? fullResult : mainResult;
}

/** Resolve call-* / whitespace-corrupted ids to the listed canonical session id. */
export function resolveSessionLookupId(sessionId: string): string {
  const sanitized = sanitizeSessionId(sessionId);
  if (!sanitized) return sanitized;
  // Ensure alias map is warm.
  getSessionSummaries(undefined, undefined, { includeSubagents: true });
  return latestSubagentAliases.get(sanitized) ?? sanitized;
}

/** Test-only: clear aggregated session summaries cache. */
export function clearSessionSummariesCache(): void {
  summariesCache.clear();
  latestSubagentAliases = new Map();
  clearLifecycleStartsCache();
}
