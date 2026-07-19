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
import { resolveTranscript } from "./agent-transcripts-path";

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

function parseJsonlLine<T>(line: string): T | null {
  try {
    return JSON.parse(line) as T;
  } catch {
    return null;
  }
}

function getSessionIdFromEvent(event: CursorEvent): string {
  return (event as { session_id?: string }).session_id ?? event.conversation_id ?? "";
}

function getSubagentSessionId(event: CursorEvent): string {
  const e = event as {
    subagent_id?: string;
    session_id?: string;
    conversation_id?: string | null;
  };
  return e.subagent_id ?? e.session_id ?? e.conversation_id ?? "";
}

function clipTitle(value: string, maxLen = 60): string {
  const trimmed = value.replace(/\s+/g, " ").trim();
  if (!trimmed) return "";
  if (trimmed.length <= maxLen) return trimmed;
  return `${trimmed.slice(0, maxLen)}…`;
}

type SummariesCacheEntry = {
  signature: string;
  result: { sessions: SessionSummary[]; truncated: boolean };
};

const summariesCache = new Map<string, SummariesCacheEntry>();

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
    const parent =
      (typeof e.parent_session_id === "string" && e.parent_session_id) ||
      (typeof e.parent_conversation_id === "string" && e.parent_conversation_id) ||
      undefined;
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
    const id = getSubagentSessionId(e);
    if (!id) continue;
    const task = typeof e.task === "string" ? e.task : undefined;
    const description = typeof e.description === "string" ? e.description : undefined;
    const parent =
      (typeof e.parent_session_id === "string" && e.parent_session_id) ||
      (typeof e.parent_conversation_id === "string" && e.parent_conversation_id) ||
      undefined;
    const subagentType =
      typeof e.subagent_type === "string" ? e.subagent_type : undefined;
    const status = typeof e.status === "string" ? e.status : undefined;
    const durationMs =
      typeof e.duration_ms === "number" && e.duration_ms > 0 ? e.duration_ms : undefined;
    byId.set(id, {
      ...byId.get(id),
      session_id: id,
      is_subagent: true,
      timestamp: e.timestamp,
      reason: status ?? byId.get(id)?.reason,
      duration_ms: durationMs ?? byId.get(id)?.duration_ms,
      parent_session_id: parent ?? byId.get(id)?.parent_session_id,
      subagent_type: subagentType ?? byId.get(id)?.subagent_type,
      task: task || description || byId.get(id)?.task,
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
} {
  const includeSubagents = Boolean(options?.includeSubagents);
  const { events, truncated } = getEvents(from, to);
  const { items: prompts, truncated: promptsTruncated } = readMergedJsonlLinesCached(
    getPromptCorpusPath(),
    parseJsonlLine<PromptRecord>,
    { from, to }
  );

  const { main, subagentsFromTranscript } = buildMainSessionSummaries(events, prompts);
  const sessions = includeSubagents
    ? [
        ...main,
        ...mergeSubagentSummaries(
          buildSubagentSessionSummaries(events),
          subagentsFromTranscript
        ),
      ].sort((a, b) => sessionSortKey(b).localeCompare(sessionSortKey(a)))
    : main.sort((a, b) => sessionSortKey(b).localeCompare(sessionSortKey(a)));

  return { sessions, truncated: truncated || promptsTruncated };
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
    return hit.result;
  }

  const result = buildSessionSummaries(from, to, options);
  summariesCache.set(cacheKey, { signature, result });
  return result;
}

/** Test-only: clear aggregated session summaries cache. */
export function clearSessionSummariesCache(): void {
  summariesCache.clear();
}

export function getSessionDetail(sessionId: string): SessionDetail | null {
  // Detail resolves both main and subagent shells (deep links work even if list toggle is off).
  const { sessions } = getSessionSummaries(undefined, undefined, { includeSubagents: true });
  const summary = sessions.find((s) => s.session_id === sessionId);
  if (!summary) return null;

  const { events, truncated: eventsTruncated } = getEvents();
  const sessionEvents = events
    .filter((e) => getSessionIdFromEvent(e) === sessionId || e.conversation_id === sessionId)
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
    .filter((p) => p.conversation_id === sessionId)
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp));

  const { items: thinking, truncated: thinkingTruncated } = readMergedJsonlLinesCached(
    getCorpusPath(),
    parseJsonlLine<ThinkingRecord>
  );
  const sessionThinking = thinking
    .filter((t) => t.conversation_id === sessionId)
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp));

  const { rounds } = getDialogueRounds({
    page: 1,
    pageSize: 200,
    conversationId: sessionId,
  });
  const transcriptTurns = getTranscriptTurns(sessionId);
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
