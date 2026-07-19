import { getEvents, getEventsPath, type CursorEvent } from "./events";
import {
  getSessionTitles,
  hasSessionTranscript,
  type ParsedSessionTitle,
} from "./session-titles";
import type { DomContextBlock } from "./parse-dom-context";
import { getCorpusPath, getPromptCorpusPath, type ThinkingRecord } from "./thinking";
import { getMergedReadSignature, readMergedJsonlLinesCached } from "./jsonl-daily";
import { getDialogueRounds, type DialogueRound } from "./dialogue";
import { spanDurationMs } from "./format-duration";
import { getTranscriptTurns, type TranscriptTurn } from "./session-transcript";
import {
  listSubagentIdsForParent,
  resolveTranscript,
} from "./agent-transcripts-path";

export type SessionSummary = {
  session_id: string;
  title?: string;
  title_dom_contexts?: DomContextBlock[];
  title_body?: string;
  reason?: string;
  duration_ms?: number;
  // sessionEnd / subagentStop timestamp
  timestamp?: string;
  // sessionStart / subagentStart timestamp
  start?: string;
  /** Latest afterAgentResponse in this session (preferred list sort key). */
  last_reply?: string;
  /** last_reply, else latest user prompt, else session end/start — used for sorting & display. */
  last_activity?: string;
  is_open?: boolean;
  /** Task-tool subagent session (from subagentStart/Stop). */
  is_subagent?: boolean;
  parent_session_id?: string;
  subagent_type?: string;
};

export type GetSessionSummariesOptions = {
  includeSubagents?: boolean;
};

type PromptRecord = {
  conversation_id: string;
  prompt: string;
  timestamp: string;
};

export type SessionDetail = SessionSummary & {
  event_counts: Record<string, number>;
  prompt_count: number;
  thinking_count: number;
  recent_prompts: Array<{ prompt: string; timestamp: string }>;
  recent_thinking: Array<{ text_preview: string; timestamp: string; model: string }>;
  timeline: Array<{
    event_type: string;
    timestamp: string;
    reason?: string;
    duration_ms?: number;
    tool_name?: string | null;
  }>;
  dialogue_rounds: DialogueRound[];
  transcript_turns: Array<
    TranscriptTurn & {
      round?: DialogueRound;
    }
  >;
};

const SESSION_EVENT_TYPES = new Set(["sessionStart", "sessionEnd"]);
const SUBAGENT_EVENT_TYPES = new Set(["subagentStart", "subagentStop"]);
const SESSION_LIFECYCLE_EVENT_TYPES = new Set([
  "sessionStart",
  "sessionEnd",
  "stop",
  "subagentStart",
  "subagentStop",
]);

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Strip whitespace/newlines from ids (Cursor tool_call_id sometimes embeds \\n). */
export function sanitizeSessionId(id: string | null | undefined): string {
  if (typeof id !== "string") return "";
  return id.replace(/\s+/g, "").trim();
}

function isHookCallSessionId(id: string): boolean {
  return sanitizeSessionId(id).startsWith("call-");
}

function isUuidSessionId(id: string): boolean {
  return UUID_RE.test(sanitizeSessionId(id));
}

function parseJsonlLine<T>(line: string): T | null {
  try {
    return JSON.parse(line) as T;
  } catch {
    return null;
  }
}

function getSessionIdFromEvent(event: CursorEvent): string {
  return sanitizeSessionId(
    (event as { session_id?: string }).session_id ?? event.conversation_id ?? ""
  );
}

function getSubagentSessionId(event: CursorEvent): string {
  const e = event as {
    subagent_id?: string;
    session_id?: string;
    conversation_id?: string | null;
    tool_call_id?: string | null;
    agent_transcript_path?: string | null;
  };
  // Prefer transcript UUID on Stop when capture stored it as session_id already;
  // fall back through hook ids.
  return sanitizeSessionId(
    e.subagent_id ?? e.session_id ?? e.conversation_id ?? e.tool_call_id ?? ""
  );
}

function clipTitle(value: string, maxLen = 60): string {
  const trimmed = value.replace(/\s+/g, " ").trim();
  if (!trimmed) return "";
  if (trimmed.length <= maxLen) return trimmed;
  return `${trimmed.slice(0, maxLen)}…`;
}

function titleMatchKey(session: SessionSummary): string {
  return (session.title_body || session.title || "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase()
    .slice(0, 80);
}

function timestampMs(iso?: string): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  return Number.isNaN(t) ? null : t;
}

function minTimestamp(
  current: string | undefined,
  next: string | undefined
): string | undefined {
  if (!next) return current;
  if (!current || next.localeCompare(current) < 0) return next;
  return current;
}

type SummariesCacheEntry = {
  signature: string;
  result: { sessions: SessionSummary[]; truncated: boolean };
  /** hook call-* id → canonical transcript UUID */
  aliases: Map<string, string>;
};

const summariesCache = new Map<string, SummariesCacheEntry>();
/** Latest includeSubagents=true alias map for detail deep-links. */
let latestSubagentAliases = new Map<string, string>();

function getSummariesCacheSignature(from?: string, to?: string): string {
  return [
    getMergedReadSignature(getEventsPath(), from, to),
    getMergedReadSignature(getPromptCorpusPath(), from, to),
  ].join("::");
}

function maxTimestamp(current: string | undefined, next: string | undefined): string | undefined {
  if (!next) return current;
  if (!current || next.localeCompare(current) > 0) return next;
  return current;
}

function buildSessionActivityById(
  events: CursorEvent[],
  prompts: PromptRecord[]
): Map<string, { last_reply?: string; last_prompt?: string }> {
  const byId = new Map<string, { last_reply?: string; last_prompt?: string }>();
  const bump = (
    id: string,
    field: "last_reply" | "last_prompt",
    ts: string | undefined
  ) => {
    if (!id || !ts) return;
    const entry = byId.get(id) ?? {};
    entry[field] = maxTimestamp(entry[field], ts);
    byId.set(id, entry);
  };

  for (const e of events) {
    if (e.event_type !== "afterAgentResponse") continue;
    bump(getSessionIdFromEvent(e), "last_reply", e.timestamp);
  }
  for (const p of prompts) {
    bump(p.conversation_id, "last_prompt", p.timestamp);
  }
  return byId;
}

function sessionSortKey(session: SessionSummary): string {
  return (
    session.last_activity ??
    session.last_reply ??
    session.timestamp ??
    session.start ??
    ""
  );
}

/** Attach titles from transcripts (caller already filtered to sessions with files). */
function attachTitles(sessions: SessionSummary[]): SessionSummary[] {
  if (sessions.length === 0) return sessions;
  const titles = getSessionTitles(sessions.map((s) => s.session_id));
  return sessions.map((session) => {
    const parsed = titles.get(session.session_id) as ParsedSessionTitle | undefined;
    if (parsed?.plain) {
      return {
        ...session,
        title: parsed.plain,
        title_dom_contexts:
          parsed.domContexts.length > 0 ? parsed.domContexts : undefined,
        title_body: parsed.body || undefined,
      };
    }
    return session;
  });
}

/** Prefer transcript title when present; keep existing title/task fallback otherwise. */
function enrichTitlesFromTranscript(sessions: SessionSummary[]): SessionSummary[] {
  const ids = sessions
    .filter((s) => hasSessionTranscript(s.session_id))
    .map((s) => s.session_id);
  if (ids.length === 0) return sessions;
  const titles = getSessionTitles(ids);
  return sessions.map((session) => {
    const parsed = titles.get(session.session_id) as ParsedSessionTitle | undefined;
    if (!parsed?.plain) return session;
    return {
      ...session,
      title: parsed.plain,
      title_dom_contexts:
        parsed.domContexts.length > 0 ? parsed.domContexts : undefined,
      title_body: parsed.body || session.title_body,
    };
  });
}

function keepListedSession(
  session: SessionSummary,
  contentById: Map<string, boolean>
): boolean {
  if (session.is_open) return true;
  if (session.title?.trim()) return true;
  return contentById.get(session.session_id) === true;
}

/**
 * Build shells from sessionStart/End, then split by transcript path.
 * Cursor often emits sessionEnd for Task subagents; those live under
 * parent/subagents/<id>.jsonl and must not appear as normal main sessions.
 */
function buildMainSessionSummaries(
  events: CursorEvent[],
  prompts: PromptRecord[]
): {
  main: SessionSummary[];
  /** sessionStart/End ids whose transcript resolves under subagents/ */
  subagentsFromTranscript: SessionSummary[];
} {
  const activityById = buildSessionActivityById(events, prompts);
  const sessionEvents = events.filter((e) => SESSION_EVENT_TYPES.has(e.event_type));
  const sessionEnds = sessionEvents.filter((e) => e.event_type === "sessionEnd");
  const sessionStarts = sessionEvents.filter((e) => e.event_type === "sessionStart");
  const sessionHasContentEvent = new Map<string, boolean>();

  for (const e of events) {
    const id = getSessionIdFromEvent(e);
    if (!id) continue;
    if (SESSION_LIFECYCLE_EVENT_TYPES.has(e.event_type)) continue;
    sessionHasContentEvent.set(id, true);
  }

  const bySessionId = new Map<string, SessionSummary>();
  for (const e of sessionStarts) {
    const id = getSessionIdFromEvent(e);
    if (!id) continue;
    bySessionId.set(id, { ...bySessionId.get(id), session_id: id, start: e.timestamp });
  }
  for (const e of sessionEnds) {
    const id = getSessionIdFromEvent(e);
    if (!id) continue;
    bySessionId.set(id, {
      ...bySessionId.get(id),
      session_id: id,
      reason: (e as { reason?: string }).reason,
      duration_ms: (e as { duration_ms?: number }).duration_ms,
      timestamp: e.timestamp,
    });
  }

  const sessions = Array.from(bySessionId.values())
    .map((session) => {
      const hasEnd = Boolean(session.timestamp);
      const activity = activityById.get(session.session_id);
      const last_reply = activity?.last_reply;
      const last_activity =
        last_reply ??
        activity?.last_prompt ??
        session.timestamp ??
        session.start;
      const spanMs = spanDurationMs(session.start, last_activity);
      const duration_ms =
        spanMs ??
        (session.duration_ms != null && session.duration_ms > 0
          ? session.duration_ms
          : undefined);
      return {
        ...session,
        last_reply,
        last_activity,
        duration_ms,
        reason: session.reason ?? (hasEnd ? session.reason : "open"),
        is_open: !hasEnd,
      };
    })
    .filter((s) => Boolean(s.start ?? s.timestamp));

  const mainRaw: SessionSummary[] = [];
  const subRaw: SessionSummary[] = [];
  for (const session of sessions) {
    const resolved = resolveTranscript(session.session_id);
    // No transcript → drop (same as prior hasSessionTranscript gate for main list).
    if (!resolved) continue;
    if (resolved.kind === "subagent") {
      subRaw.push({
        ...session,
        is_subagent: true,
        parent_session_id: resolved.parentSessionId,
      });
    } else {
      mainRaw.push(session);
    }
  }

  return {
    main: attachTitles(mainRaw).filter((s) => keepListedSession(s, sessionHasContentEvent)),
    subagentsFromTranscript: enrichTitlesFromTranscript(subRaw).filter((s) =>
      keepListedSession(s, sessionHasContentEvent)
    ),
  };
}

function mergeSubagentSummaries(
  fromEvents: SessionSummary[],
  fromTranscript: SessionSummary[]
): SessionSummary[] {
  const byId = new Map<string, SessionSummary>();
  for (const s of fromTranscript) {
    byId.set(s.session_id, s);
  }
  for (const s of fromEvents) {
    const prev = byId.get(s.session_id);
    byId.set(s.session_id, {
      ...prev,
      ...s,
      is_subagent: true,
      parent_session_id: s.parent_session_id ?? prev?.parent_session_id,
      subagent_type: s.subagent_type ?? prev?.subagent_type,
      title: s.title?.trim() ? s.title : prev?.title,
      title_body: s.title_body?.trim() ? s.title_body : prev?.title_body,
      title_dom_contexts: s.title_dom_contexts ?? prev?.title_dom_contexts,
      start: s.start ?? prev?.start,
      timestamp: s.timestamp ?? prev?.timestamp,
      last_activity: s.last_activity ?? prev?.last_activity,
      duration_ms: s.duration_ms ?? prev?.duration_ms,
      reason: s.reason ?? prev?.reason,
      is_open: s.is_open ?? prev?.is_open,
    });
  }
  return Array.from(byId.values());
}

function mergeSubagentPair(
  canonical: SessionSummary,
  hook: SessionSummary
): SessionSummary {
  const start = minTimestamp(canonical.start, hook.start);
  const timestamp = canonical.timestamp ?? hook.timestamp;
  const last_activity =
    maxTimestamp(canonical.last_activity, hook.last_activity) ??
    timestamp ??
    start;
  const hasEnd = Boolean(timestamp);
  const closedReason =
    (canonical.reason && canonical.reason !== "open" ? canonical.reason : undefined) ??
    (hook.reason && hook.reason !== "open" ? hook.reason : undefined);
  const spanMs = spanDurationMs(start, last_activity);
  return {
    ...canonical,
    is_subagent: true,
    parent_session_id: canonical.parent_session_id ?? hook.parent_session_id,
    subagent_type: canonical.subagent_type ?? hook.subagent_type,
    title: canonical.title?.trim() ? canonical.title : hook.title,
    title_body: canonical.title_body?.trim() ? canonical.title_body : hook.title_body,
    title_dom_contexts: canonical.title_dom_contexts ?? hook.title_dom_contexts,
    start,
    timestamp,
    last_activity,
    duration_ms:
      spanMs ??
      canonical.duration_ms ??
      hook.duration_ms,
    reason: closedReason ?? (hasEnd ? closedReason : "open"),
    is_open: !hasEnd,
  };
}

/**
 * Cursor Task hooks use call-* tool_call ids, while the live conversation /
 * transcript uses a UUID. Map hook shells onto the UUID and drop leftovers.
 */
function resolveHookCanonicalId(
  hook: SessionSummary,
  events: CursorEvent[],
  claimed: Set<string>
): string | null {
  const parent = hook.parent_session_id;
  if (!parent) return null;
  const hookStart = timestampMs(hook.start);
  const hookEnd = timestampMs(hook.timestamp) ?? Date.now();
  if (hookStart == null) return null;
  const slackMs = 120_000;

  const scores = new Map<string, number>();
  const bump = (id: string, weight: number) => {
    if (!id || claimed.has(id) || !isUuidSessionId(id)) return;
    scores.set(id, (scores.get(id) ?? 0) + weight);
  };

  for (const e of events) {
    if (SUBAGENT_EVENT_TYPES.has(e.event_type)) continue;
    const id = getSessionIdFromEvent(e);
    if (!id || isHookCallSessionId(id) || !isUuidSessionId(id)) continue;
    const t = timestampMs(e.timestamp);
    if (t == null || t < hookStart - slackMs || t > hookEnd + slackMs) continue;
    const resolved = resolveTranscript(id);
    if (resolved?.kind === "subagent" && resolved.parentSessionId === parent) {
      bump(id, e.event_type === "sessionEnd" ? 5 : 1);
    }
  }

  for (const id of listSubagentIdsForParent(parent)) {
    if (claimed.has(id) || !isUuidSessionId(id)) continue;
    // Mild prior: transcript exists under this parent.
    bump(id, scores.has(id) ? 0 : 0.5);
  }

  if (scores.size === 0) return null;

  const hookTitle = titleMatchKey(hook);
  let bestId: string | null = null;
  let bestScore = -Infinity;
  for (const [id, score] of scores) {
    let adjusted = score;
    if (hookTitle) {
      const titles = getSessionTitles([id]);
      const plain = (titles.get(id)?.plain ?? "").toLowerCase();
      if (
        plain &&
        (plain === hookTitle || plain.startsWith(hookTitle.slice(0, 40)))
      ) {
        adjusted += 50;
      }
    }
    // Prefer the UUID whose activity starts nearest the hook start.
    for (const e of events) {
      if (getSessionIdFromEvent(e) !== id) continue;
      if (SESSION_LIFECYCLE_EVENT_TYPES.has(e.event_type)) continue;
      const t = timestampMs(e.timestamp);
      if (t == null) continue;
      adjusted -= Math.min(30, Math.abs(t - hookStart) / 60_000);
      break;
    }
    if (adjusted > bestScore) {
      bestScore = adjusted;
      bestId = id;
    }
  }

  // Require real signal (content/sessionEnd), not filesystem-only 0.5.
  if (bestId == null || bestScore < 1) return null;
  return bestId;
}

function canonicalizeSubagentSummaries(
  sessions: SessionSummary[],
  events: CursorEvent[]
): { sessions: SessionSummary[]; aliases: Map<string, string> } {
  const aliases = new Map<string, string>();
  const byId = new Map<string, SessionSummary>();
  const hooks: SessionSummary[] = [];

  for (const session of sessions) {
    const id = sanitizeSessionId(session.session_id);
    if (!id) continue;
    const normalized = { ...session, session_id: id };
    if (isHookCallSessionId(id)) {
      hooks.push(normalized);
    } else {
      byId.set(id, normalized);
    }
  }

  const claimed = new Set<string>();

  for (const hook of hooks) {
    const canonicalId = resolveHookCanonicalId(hook, events, claimed);
    if (!canonicalId) {
      // Ghost Start-only call-* shells (no transcript/content under that id).
      continue;
    }
    claimed.add(canonicalId);
    aliases.set(hook.session_id, canonicalId);

    const existing = byId.get(canonicalId);
    if (existing) {
      byId.set(canonicalId, mergeSubagentPair(existing, hook));
    } else {
      const resolved = resolveTranscript(canonicalId);
      byId.set(
        canonicalId,
        mergeSubagentPair(
          {
            session_id: canonicalId,
            is_subagent: true,
            parent_session_id:
              hook.parent_session_id ??
              (resolved?.kind === "subagent" ? resolved.parentSessionId : undefined),
          },
          hook
        )
      );
    }
  }

  return {
    sessions: enrichTitlesFromTranscript(Array.from(byId.values())),
    aliases,
  };
}

function buildSubagentSessionSummaries(events: CursorEvent[]): SessionSummary[] {
  const byId = new Map<string, SessionSummary & { task?: string }>();
  const contentById = new Map<string, boolean>();

  for (const e of events) {
    if (SUBAGENT_EVENT_TYPES.has(e.event_type)) continue;
    if (SESSION_LIFECYCLE_EVENT_TYPES.has(e.event_type)) continue;
    const id = getSessionIdFromEvent(e);
    if (id) contentById.set(id, true);
  }

  for (const e of events) {
    if (e.event_type !== "subagentStart") continue;
    const id = getSubagentSessionId(e);
    if (!id) continue;
    const task = typeof e.task === "string" ? e.task : undefined;
    const parent = sanitizeSessionId(
      (typeof e.parent_session_id === "string" && e.parent_session_id) ||
        (typeof e.parent_conversation_id === "string" && e.parent_conversation_id) ||
        ""
    ) || undefined;
    const subagentType =
      typeof e.subagent_type === "string" ? e.subagent_type : undefined;
    byId.set(id, {
      ...byId.get(id),
      session_id: id,
      start: e.timestamp,
      is_subagent: true,
      parent_session_id: parent ?? byId.get(id)?.parent_session_id,
      subagent_type: subagentType ?? byId.get(id)?.subagent_type,
      task: task || byId.get(id)?.task,
    });
  }

  for (const e of events) {
    if (e.event_type !== "subagentStop") continue;
    // Prefer transcript UUID when capture/stop path recorded it.
    const fromPath = (() => {
      const p = (e as { agent_transcript_path?: string }).agent_transcript_path;
      if (typeof p !== "string" || !p) return "";
      const normalized = p.replace(/\\/g, "/");
      const marker = "/subagents/";
      const idx = normalized.lastIndexOf(marker);
      if (idx < 0) return "";
      const rest = normalized.slice(idx + marker.length);
      const file = rest.split("/")[0] || "";
      return sanitizeSessionId(file.replace(/\.(jsonl|txt)$/i, ""));
    })();
    const hookId = getSubagentSessionId(e);
    const id = fromPath || hookId;
    if (!id) continue;
    const task = typeof e.task === "string" ? e.task : undefined;
    const description = typeof e.description === "string" ? e.description : undefined;
    const parent = sanitizeSessionId(
      (typeof e.parent_session_id === "string" && e.parent_session_id) ||
        (typeof e.parent_conversation_id === "string" && e.parent_conversation_id) ||
        ""
    ) || undefined;
    const subagentType =
      typeof e.subagent_type === "string" ? e.subagent_type : undefined;
    const status = typeof e.status === "string" ? e.status : undefined;
    const durationMs =
      typeof e.duration_ms === "number" && e.duration_ms > 0 ? e.duration_ms : undefined;

    // If Stop rewrites to UUID but Start was under call-*, seed from Start row.
    const prev = byId.get(id) ?? (hookId && hookId !== id ? byId.get(hookId) : undefined);
    byId.set(id, {
      ...prev,
      session_id: id,
      is_subagent: true,
      timestamp: e.timestamp,
      reason: status ?? prev?.reason,
      duration_ms: durationMs ?? prev?.duration_ms,
      parent_session_id: parent ?? prev?.parent_session_id,
      subagent_type: subagentType ?? prev?.subagent_type,
      task: task || description || prev?.task,
      start: prev?.start,
    });
  }

  const sessions = Array.from(byId.values())
    .map((session) => {
      const hasEnd = Boolean(session.timestamp);
      const last_activity = session.timestamp ?? session.start;
      const spanMs = spanDurationMs(session.start, last_activity);
      const duration_ms =
        spanMs ??
        (session.duration_ms != null && session.duration_ms > 0
          ? session.duration_ms
          : undefined);
      const taskTitle = session.task ? clipTitle(session.task) : undefined;
      let parentSessionId = session.parent_session_id;
      if (!parentSessionId) {
        const resolved = resolveTranscript(session.session_id);
        if (resolved?.kind === "subagent" && resolved.parentSessionId) {
          parentSessionId = resolved.parentSessionId;
        }
      }
      return {
        session_id: session.session_id,
        start: session.start,
        timestamp: session.timestamp,
        reason: session.reason ?? (hasEnd ? session.reason : "open"),
        duration_ms,
        last_activity,
        is_open: !hasEnd,
        is_subagent: true,
        parent_session_id: parentSessionId,
        subagent_type: session.subagent_type,
        title: taskTitle,
        title_body: session.task?.trim() || undefined,
      } satisfies SessionSummary;
    })
    .filter((s) => Boolean(s.start ?? s.timestamp));

  // Subagents are listed from Start/Stop lifecycle; transcript is optional enrichment.
  const withTitles = enrichTitlesFromTranscript(sessions);
  return withTitles.filter((session) => keepListedSession(session, contentById));
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

export function getSessionSummaries(
  from?: string,
  to?: string,
  options?: GetSessionSummariesOptions
): {
  sessions: SessionSummary[];
  truncated: boolean;
} {
  const includeSubagents = Boolean(options?.includeSubagents);
  const cacheKey = `${from ?? ""}::${to ?? ""}::sub:${includeSubagents ? 1 : 0}`;
  const signature = getSummariesCacheSignature(from, to);
  const hit = summariesCache.get(cacheKey);
  if (hit && hit.signature === signature) {
    if (includeSubagents) latestSubagentAliases = hit.aliases;
    return hit.result;
  }

  const built = buildSessionSummaries(from, to, options);
  const result = { sessions: built.sessions, truncated: built.truncated };
  summariesCache.set(cacheKey, {
    signature,
    result,
    aliases: built.aliases,
  });
  if (includeSubagents) latestSubagentAliases = built.aliases;
  return result;
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
}

export function getSessionDetail(sessionId: string): SessionDetail | null {
  const lookupId = resolveSessionLookupId(sessionId);
  // Detail resolves both main and subagent shells (deep links work even if list toggle is off).
  const { sessions } = getSessionSummaries(undefined, undefined, { includeSubagents: true });
  const summary = sessions.find((s) => s.session_id === lookupId);
  if (!summary) return null;

  const aliasIds = new Set<string>([lookupId, sanitizeSessionId(sessionId)]);
  for (const [hookId, canonical] of latestSubagentAliases) {
    if (canonical === lookupId) aliasIds.add(hookId);
  }

  const { events, truncated: eventsTruncated } = getEvents();
  const sessionEvents = events
    .filter((e) => {
      const id = getSessionIdFromEvent(e);
      return id && aliasIds.has(id);
    })
    .sort((a, b) => (a.timestamp ?? "").localeCompare(b.timestamp ?? ""));

  const event_counts: Record<string, number> = {};
  for (const event of sessionEvents) {
    event_counts[event.event_type] = (event_counts[event.event_type] ?? 0) + 1;
  }

  const { items: prompts, truncated: promptsTruncated } = readMergedJsonlLinesCached(
    getPromptCorpusPath(),
    parseJsonlLine<PromptRecord>
  );
  const sessionPrompts = prompts
    .filter((p) => aliasIds.has(sanitizeSessionId(p.conversation_id)))
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp));

  const { items: thinking, truncated: thinkingTruncated } = readMergedJsonlLinesCached(
    getCorpusPath(),
    parseJsonlLine<ThinkingRecord>
  );
  const sessionThinking = thinking
    .filter((t) => aliasIds.has(sanitizeSessionId(t.conversation_id)))
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp));

  const { rounds } = getDialogueRounds({
    page: 1,
    pageSize: 200,
    conversationId: lookupId,
  });
  const transcriptTurns = getTranscriptTurns(lookupId);
  const roundsAsc = [...rounds].sort((a, b) =>
    a.prompt_timestamp.localeCompare(b.prompt_timestamp)
  );
  const transcriptTurnsWithRounds = transcriptTurns.map((turn) => {
    const normalizedPrompt = turn.user_prompt.toLowerCase();
    const exactIdx = roundsAsc.findIndex(
      (round) =>
        round.prompt.trim().toLowerCase() === normalizedPrompt ||
        normalizedPrompt.includes(round.prompt.trim().toLowerCase()) ||
        round.prompt.trim().toLowerCase().includes(normalizedPrompt)
    );
    if (exactIdx >= 0) {
      const [matchedRound] = roundsAsc.splice(exactIdx, 1);
      return { ...turn, round: matchedRound };
    }
    const fallbackRound = roundsAsc.shift();
    return { ...turn, round: fallbackRound };
  });

  return {
    ...summary,
    event_counts: {
      ...event_counts,
      _truncated_sources: Number(eventsTruncated || promptsTruncated || thinkingTruncated),
    },
    prompt_count: sessionPrompts.length,
    thinking_count: sessionThinking.length,
    recent_prompts: sessionPrompts.slice(0, 10).map((p) => ({ prompt: p.prompt, timestamp: p.timestamp })),
    recent_thinking: sessionThinking.slice(0, 10).map((t) => ({
      text_preview: t.text.length > 180 ? `${t.text.slice(0, 180)}…` : t.text,
      timestamp: t.timestamp,
      model: t.model,
    })),
    timeline: sessionEvents.slice(-80).reverse().map((e) => ({
      event_type: e.event_type,
      timestamp: e.timestamp,
      reason:
        (e as { reason?: string }).reason ??
        (typeof e.status === "string" ? e.status : undefined),
      duration_ms: (e as { duration_ms?: number }).duration_ms,
      tool_name: (e as { tool_name?: string | null }).tool_name,
    })),
    dialogue_rounds: rounds,
    transcript_turns: transcriptTurnsWithRounds,
  };
}
