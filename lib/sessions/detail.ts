import type { CursorEvent } from "../events";
import { getEvents } from "../events";
import { getCursorConversationTitles } from "../cursor-conversation-titles";
import {
  clipParsedSessionTitle,
  getSessionTitles,
} from "../session-titles";
import type { DomContextBlock, PromptSegment } from "../parse-dom-context";
import { getCorpusPath, getPromptCorpusPath, type ThinkingRecord } from "../thinking";
import { readMergedJsonlLinesCached } from "../jsonl-daily";
import { getDialogueRounds } from "../dialogue";
import { spanDurationMs } from "../format-duration";
import { compareTimestamps } from "../format-datetime";
import { getTranscriptTurns } from "../session-transcript";
import {
  listSubagentIdsForParent,
  resolveTranscript,
} from "../agent-transcripts-path";
import { resolveSessionDisplayTitles } from "../resolve-session-titles";
import {
  SUBAGENT_EVENT_TYPES,
  getSessionIdFromEvent,
  getSubagentSessionId,
  isHookCallSessionId,
  isUuidSessionId,
  sanitizeSessionId,
  subagentIdFromTranscriptPath,
} from "./ids";
import {
  getGlobalSessionStartIds,
  getGlobalSubagentStartIds,
} from "./lifecycle";
import { buildSessionActivityById } from "./main-summaries";
import {
  getLatestSubagentAliases,
  resolveSessionLookupId,
} from "./summaries";
import type {
  PromptRecord,
  SessionDetail,
  SessionSubagentLink,
  SessionSummary,
  SessionTitleSource,
} from "./types";
import {
  clipTitle,
  maxTimestamp,
  minTimestamp,
  parseJsonlLine,
  promptFieldsFromParsed,
} from "./util";

/**
 * Resolve detail lookup without rebuilding all session summaries.
 * Falls back to full summaries only for rare call-* deep links.
 */
function resolveDetailLookupId(
  sessionId: string,
  events: CursorEvent[]
): string {
  const sanitized = sanitizeSessionId(sessionId);
  if (!sanitized) return sanitized;
  const warm = getLatestSubagentAliases().get(sanitized);
  if (warm) return warm;
  if (!isHookCallSessionId(sanitized)) return sanitized;

  for (const e of events) {
    if (e.event_type !== "subagentStop") continue;
    const hookId = getSubagentSessionId(e);
    const toolCallId = sanitizeSessionId(
      (e as { tool_call_id?: string | null }).tool_call_id
    );
    if (hookId !== sanitized && toolCallId !== sanitized) continue;
    const fromPath = subagentIdFromTranscriptPath(
      (e as { agent_transcript_path?: string }).agent_transcript_path
    );
    if (fromPath && isUuidSessionId(fromPath)) return fromPath;
  }

  return resolveSessionLookupId(sanitized);
}

function collectDetailAliasIds(
  lookupId: string,
  rawSessionId: string,
  events: CursorEvent[]
): Set<string> {
  const aliasIds = new Set<string>();
  const add = (id: string | null | undefined) => {
    const sanitized = sanitizeSessionId(id);
    if (sanitized) aliasIds.add(sanitized);
  };
  add(lookupId);
  add(rawSessionId);
  for (const [hookId, canonical] of getLatestSubagentAliases()) {
    if (canonical === lookupId) add(hookId);
  }
  for (const e of events) {
    if (e.event_type !== "subagentStop") continue;
    const fromPath = subagentIdFromTranscriptPath(
      (e as { agent_transcript_path?: string }).agent_transcript_path
    );
    if (fromPath !== lookupId) continue;
    add(getSubagentSessionId(e));
    add((e as { tool_call_id?: string | null }).tool_call_id);
  }
  return aliasIds;
}

/**
 * Collect Task subagent children for a parent session.
 * Prefers filesystem `<parent>/subagents/*.jsonl`, merges hook UUIDs with matching parent.
 */
function collectSubagentsForParent(
  parentId: string,
  events: CursorEvent[],
  prompts: PromptRecord[]
): SessionSubagentLink[] {
  const sanitizedParent = sanitizeSessionId(parentId);
  if (!sanitizedParent) return [];

  const idSet = new Set(
    listSubagentIdsForParent(sanitizedParent)
      .map(sanitizeSessionId)
      .filter(Boolean)
  );

  for (const e of events) {
    if (!SUBAGENT_EVENT_TYPES.has(e.event_type)) continue;
    const parent = sanitizeSessionId(
      (typeof e.parent_session_id === "string" && e.parent_session_id) ||
        (typeof e.parent_conversation_id === "string" &&
          e.parent_conversation_id) ||
        ""
    );
    if (parent !== sanitizedParent) continue;
    const fromPath = subagentIdFromTranscriptPath(
      (e as { agent_transcript_path?: string }).agent_transcript_path
    );
    const id = sanitizeSessionId(fromPath || getSubagentSessionId(e));
    if (id && isUuidSessionId(id)) idSet.add(id);
  }

  const links: SessionSubagentLink[] = [];
  for (const id of idSet) {
    const aliasIds = collectDetailAliasIds(id, id, events);
    const summary = buildSingleSessionSummary(id, events, prompts, aliasIds);
    if (
      summary?.parent_session_id &&
      sanitizeSessionId(summary.parent_session_id) !== sanitizedParent
    ) {
      continue;
    }

    let task_description: string | undefined;
    let subagent_type = summary?.subagent_type;
    for (const e of events) {
      if (!SUBAGENT_EVENT_TYPES.has(e.event_type)) continue;
      const parent = sanitizeSessionId(
        (typeof e.parent_session_id === "string" && e.parent_session_id) ||
          (typeof e.parent_conversation_id === "string" &&
            e.parent_conversation_id) ||
          ""
      );
      if (parent !== sanitizedParent) continue;
      const fromPath = subagentIdFromTranscriptPath(
        (e as { agent_transcript_path?: string }).agent_transcript_path
      );
      const eventId = sanitizeSessionId(fromPath || getSubagentSessionId(e));
      const sameChild =
        fromPath === id ||
        (eventId !== "" && (eventId === id || aliasIds.has(eventId)));
      if (!sameChild) {
        // Stop often only has call-* id; fall back to description ↔ title.
        const stopDescription =
          e.event_type === "subagentStop" &&
          typeof e.description === "string"
            ? e.description.trim()
            : "";
        const title = summary?.title?.trim() ?? "";
        if (
          !stopDescription ||
          !title ||
          (stopDescription !== title &&
            !(
              title.endsWith("…") &&
              stopDescription.startsWith(title.replace(/…$/, ""))
            ))
        ) {
          continue;
        }
      }
      if (typeof e.description === "string" && e.description.trim()) {
        task_description = e.description.trim();
      }
      if (typeof e.subagent_type === "string" && e.subagent_type.trim()) {
        subagent_type = e.subagent_type.trim();
      }
    }

    links.push({
      session_id: id,
      title: summary?.title,
      title_dom_contexts: summary?.title_dom_contexts,
      title_segments: summary?.title_segments,
      title_body: summary?.title_body,
      task_description: task_description || summary?.title,
      subagent_type,
      start: summary?.start,
      timestamp: summary?.timestamp,
      is_open: summary?.is_open,
    });
  }

  return links.sort((a, b) =>
    (a.start ?? a.timestamp ?? "").localeCompare(b.start ?? b.timestamp ?? "")
  );
}

/** Build one session summary from scoped events — no full-list / all-titles scan. */
function buildSingleSessionSummary(
  lookupId: string,
  events: CursorEvent[],
  prompts: PromptRecord[],
  aliasIds: Set<string>
): SessionSummary | null {
  const resolved = resolveTranscript(lookupId);
  const scopedEvents = events.filter((e) =>
    aliasIds.has(getSessionIdFromEvent(e))
  );
  const scopedPrompts = prompts.filter((p) =>
    aliasIds.has(sanitizeSessionId(p.conversation_id))
  );

  if (
    scopedEvents.length === 0 &&
    scopedPrompts.length === 0 &&
    !resolved
  ) {
    return null;
  }

  const activityMap = buildSessionActivityById(scopedEvents, scopedPrompts);
  let last_reply: string | undefined;
  let last_prompt: string | undefined;
  for (const id of aliasIds) {
    const activity = activityMap.get(id);
    if (!activity) continue;
    last_reply = maxTimestamp(last_reply, activity.last_reply);
    last_prompt = maxTimestamp(last_prompt, activity.last_prompt);
  }

  let start: string | undefined;
  let endTs: string | undefined;
  let reason: string | undefined;
  let duration_ms: number | undefined;
  let subagent_type: string | undefined;
  let parent_session_id =
    resolved?.kind === "subagent" ? resolved.parentSessionId : undefined;
  let task: string | undefined;
  let is_subagent = resolved?.kind === "subagent";
  let sawLifecycleStart = false;

  for (const e of scopedEvents) {
    if (e.event_type === "sessionStart") {
      sawLifecycleStart = true;
      start = minTimestamp(start, e.timestamp);
    } else if (e.event_type === "subagentStart") {
      sawLifecycleStart = true;
      is_subagent = true;
      start = minTimestamp(start, e.timestamp);
      if (typeof e.subagent_type === "string") {
        subagent_type = e.subagent_type;
      }
      if (typeof e.task === "string" && e.task.trim()) {
        task = e.task;
      }
      const parent = sanitizeSessionId(
        (typeof e.parent_session_id === "string" && e.parent_session_id) ||
          (typeof e.parent_conversation_id === "string" &&
            e.parent_conversation_id) ||
          ""
      );
      if (parent) parent_session_id = parent;
    } else if (e.event_type === "sessionEnd") {
      endTs = maxTimestamp(endTs, e.timestamp);
      reason = (e as { reason?: string }).reason ?? reason;
      const endDuration = (e as { duration_ms?: number }).duration_ms;
      if (typeof endDuration === "number" && endDuration > 0) {
        duration_ms = endDuration;
      }
    } else if (e.event_type === "subagentStop") {
      is_subagent = true;
      endTs = maxTimestamp(endTs, e.timestamp);
      if (typeof e.status === "string") reason = e.status;
      if (typeof e.subagent_type === "string") {
        subagent_type = e.subagent_type;
      }
      if (typeof e.task === "string" && e.task.trim()) task = e.task;
      else if (typeof e.description === "string" && e.description.trim()) {
        task = e.description;
      }
      if (
        typeof e.duration_ms === "number" &&
        e.duration_ms > 0
      ) {
        duration_ms = e.duration_ms;
      }
      const parent = sanitizeSessionId(
        (typeof e.parent_session_id === "string" && e.parent_session_id) ||
          (typeof e.parent_conversation_id === "string" &&
            e.parent_conversation_id) ||
          ""
      );
      if (parent) parent_session_id = parent;
    }
  }

  if (!start) {
    for (const e of scopedEvents) {
      start = minTimestamp(start, e.timestamp);
    }
    for (const p of scopedPrompts) {
      start = minTimestamp(start, p.timestamp);
    }
  }

  if (!sawLifecycleStart) {
    sawLifecycleStart = is_subagent
      ? getGlobalSubagentStartIds().has(lookupId)
      : getGlobalSessionStartIds().has(lookupId);
  }

  const last_activity =
    last_reply ?? last_prompt ?? endTs ?? start;
  const hasEnd = Boolean(endTs);
  const spanMs = spanDurationMs(start, last_activity);
  const titles = getSessionTitles([lookupId]);
  const parsed = titles.get(lookupId);
  const taskTitle = task ? clipTitle(task) : undefined;
  const cursorTitle = getCursorConversationTitles([lookupId])
    .get(lookupId)
    ?.trim();
  const promptFields = parsed?.plain ? promptFieldsFromParsed(parsed) : {};

  let title = cursorTitle || parsed?.plain || taskTitle;
  const title_source: SessionTitleSource | undefined = cursorTitle
    ? "cursor"
    : parsed?.plain
      ? "prompt"
      : taskTitle
        ? "task"
        : undefined;
  let title_dom_contexts: DomContextBlock[] | undefined;
  let title_segments: PromptSegment[] | undefined;
  let title_body: string | undefined;

  if (cursorTitle) {
    title = cursorTitle;
  } else if (parsed?.plain) {
    const clipped = clipParsedSessionTitle(parsed);
    title = clipped.plain;
    title_dom_contexts =
      clipped.domContexts.length > 0 ? clipped.domContexts : undefined;
    title_segments =
      clipped.segments.length > 0 ? clipped.segments : undefined;
    title_body = clipped.body || undefined;
  } else if (taskTitle) {
    title = taskTitle;
    title_body = task?.trim() || undefined;
  }

  return {
    session_id: lookupId,
    start,
    timestamp: endTs,
    reason: reason ?? (hasEnd ? reason : "open"),
    duration_ms: spanMs ?? duration_ms,
    last_reply,
    last_activity,
    is_open: !hasEnd,
    is_subagent: is_subagent || undefined,
    parent_session_id,
    subagent_type,
    lifecycle_source: sawLifecycleStart ? "hooks" : "inferred",
    lifecycle_gaps: sawLifecycleStart
      ? undefined
      : [is_subagent ? "subagentStart" : "sessionStart"],
    title,
    title_source,
    title_dom_contexts,
    title_segments,
    title_body,
    ...promptFields,
  };
}

export function getSessionDetail(sessionId: string): SessionDetail | null {
  const { events, truncated: eventsTruncated } = getEvents();
  const lookupId = resolveDetailLookupId(sessionId, events);
  const aliasIds = collectDetailAliasIds(lookupId, sessionId, events);

  const { items: prompts, truncated: promptsTruncated } =
    readMergedJsonlLinesCached(
      getPromptCorpusPath(),
      parseJsonlLine<PromptRecord>
    );

  const summary = buildSingleSessionSummary(
    lookupId,
    events,
    prompts,
    aliasIds
  );
  if (!summary) return null;

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

  const sessionPrompts = prompts
    .filter((p) => aliasIds.has(sanitizeSessionId(p.conversation_id)))
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp));

  const { items: thinking, truncated: thinkingTruncated } =
    readMergedJsonlLinesCached(
      getCorpusPath(),
      parseJsonlLine<ThinkingRecord>
    );
  const sessionThinking = thinking
    .filter((t) => aliasIds.has(sanitizeSessionId(t.conversation_id)))
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp));

  const { rounds } = getDialogueRounds({
    page: 1,
    pageSize: 200,
    conversationIds: Array.from(aliasIds),
  });
  const transcriptTurns = getTranscriptTurns(lookupId);
  const roundsAsc = [...rounds].sort((a, b) =>
    compareTimestamps(a.prompt_timestamp, b.prompt_timestamp)
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

  const parentId = summary.parent_session_id;
  const parentTitle = parentId
    ? resolveSessionDisplayTitles([parentId]).get(parentId)
    : undefined;

  const subagents = summary.is_subagent
    ? undefined
    : collectSubagentsForParent(lookupId, events, prompts);

  return {
    ...summary,
    parent_session_title: parentTitle?.title,
    parent_session_title_dom_contexts: parentTitle?.title_dom_contexts,
    parent_session_title_segments: parentTitle?.title_segments,
    parent_session_title_body: parentTitle?.title_body,
    subagents: subagents && subagents.length > 0 ? subagents : undefined,
    event_counts: {
      ...event_counts,
      _truncated_sources: Number(
        eventsTruncated || promptsTruncated || thinkingTruncated
      ),
    },
    prompt_count: sessionPrompts.length,
    thinking_count: sessionThinking.length,
    recent_prompts: sessionPrompts.slice(0, 10).map((p) => ({
      prompt: p.prompt,
      timestamp: p.timestamp,
    })),
    recent_thinking: sessionThinking.slice(0, 10).map((t) => ({
      text_preview:
        t.text.length > 180 ? `${t.text.slice(0, 180)}…` : t.text,
      timestamp: t.timestamp,
      model: t.model,
    })),
    timeline: sessionEvents
      .slice(-80)
      .reverse()
      .map((e) => ({
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
