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
import { getTranscriptTurns, type TranscriptTurn } from "./session-transcript";

export type SessionSummary = {
  session_id: string;
  title?: string;
  title_dom_contexts?: DomContextBlock[];
  title_body?: string;
  reason?: string;
  duration_ms?: number;
  // sessionEnd timestamp
  timestamp?: string;
  // sessionStart timestamp
  start?: string;
  /** Latest afterAgentResponse in this session (preferred list sort key). */
  last_reply?: string;
  /** last_reply, else latest user prompt, else session end/start — used for sorting & display. */
  last_activity?: string;
  is_open?: boolean;
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
const SESSION_LIFECYCLE_EVENT_TYPES = new Set(["sessionStart", "sessionEnd", "stop"]);

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

function buildSessionSummaries(from?: string, to?: string): {
  sessions: SessionSummary[];
  truncated: boolean;
} {
  const { events, truncated } = getEvents(from, to);
  const { items: prompts, truncated: promptsTruncated } = readMergedJsonlLinesCached(
    getPromptCorpusPath(),
    parseJsonlLine<PromptRecord>,
    { from, to }
  );
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
      return {
        ...session,
        last_reply,
        last_activity,
        reason: session.reason ?? (hasEnd ? session.reason : "open"),
        is_open: !hasEnd,
      };
    })
    .filter((s) => Boolean(s.start ?? s.timestamp))
    .sort((a, b) => sessionSortKey(b).localeCompare(sessionSortKey(a)));

  const withTranscript = sessions.filter((session) => hasSessionTranscript(session.session_id));
  const titles = getSessionTitles(withTranscript.map((s) => s.session_id));
  const sessionsWithTitle = withTranscript.map((session) => {
    const parsed = titles.get(session.session_id) as ParsedSessionTitle | undefined;
    return {
      ...session,
      title: parsed?.plain,
      title_dom_contexts:
        parsed && parsed.domContexts.length > 0 ? parsed.domContexts : undefined,
      title_body: parsed?.body || undefined,
    };
  });
  const filteredSessions = sessionsWithTitle.filter((session) => {
    // 过滤仅打开后立刻关闭、无实际交互痕迹的空会话
    if (session.is_open) return true;
    const hasTitle = Boolean(session.title?.trim());
    if (hasTitle) return true;
    return sessionHasContentEvent.get(session.session_id) === true;
  });

  return { sessions: filteredSessions, truncated: truncated || promptsTruncated };
}

export function getSessionSummaries(from?: string, to?: string): {
  sessions: SessionSummary[];
  truncated: boolean;
} {
  const cacheKey = `${from ?? ""}::${to ?? ""}`;
  const signature = getSummariesCacheSignature(from, to);
  const hit = summariesCache.get(cacheKey);
  if (hit && hit.signature === signature) {
    return hit.result;
  }

  const result = buildSessionSummaries(from, to);
  summariesCache.set(cacheKey, { signature, result });
  return result;
}

/** Test-only: clear aggregated session summaries cache. */
export function clearSessionSummariesCache(): void {
  summariesCache.clear();
}

export function getSessionDetail(sessionId: string): SessionDetail | null {
  const { sessions } = getSessionSummaries();
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
      reason: (e as { reason?: string }).reason,
      duration_ms: (e as { duration_ms?: number }).duration_ms,
      tool_name: (e as { tool_name?: string | null }).tool_name,
    })),
    dialogue_rounds: rounds,
    transcript_turns: transcriptTurnsWithRounds,
  };
}
