import type { CursorEvent } from "../events";
import { spanDurationMs } from "../format-duration";
import { resolveTranscript } from "../agent-transcripts-path";
import {
  SESSION_EVENT_TYPES,
  SESSION_LIFECYCLE_EVENT_TYPES,
  getSessionIdFromEvent,
  isUuidSessionId,
  sanitizeSessionId,
} from "./ids";
import { getGlobalLifecycleStarts } from "./lifecycle";
import { keepListedSession } from "./titles";
import type { PromptRecord, SessionLifecycleSource, SessionSummary } from "./types";
import { maxTimestamp, minTimestamp } from "./util";

export function buildSessionActivityById(
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

/**
 * Build shells from sessionStart/End, then split by transcript path.
 * Cursor often emits sessionEnd for Task subagents; those live under
 * parent/subagents/<id>.jsonl and must not appear as normal main sessions.
 */
export function buildMainSessionSummaries(
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

  const { sessionStart: globalStartedIds, subagentStart: globalSubagentStartIds } =
    getGlobalLifecycleStarts();

  // Backfill shells when sessionStart was never captured anywhere in the
  // corpus (e.g. Windows hook stdin BOM), but prompts exist in this window.
  // Do NOT backfill when start only falls outside the date filter — that is
  // normal lookback behavior, not a capture gap.
  const backfilledIds = new Set<string>();
  const ensureShell = (id: string, ts: string | undefined) => {
    if (!id || !isUuidSessionId(id) || !ts) return;
    if (globalStartedIds.has(id)) return;
    const prev = bySessionId.get(id);
    if (!prev) {
      bySessionId.set(id, {
        session_id: id,
        start: ts,
        reason: "open",
        is_open: true,
      });
      backfilledIds.add(id);
      return;
    }
    // Existing row from sessionEnd (or prior prompt backfill) without a global
    // sessionStart — fill/advance start from prompt timestamps.
    if (prev.start && !backfilledIds.has(id)) return;
    const start = minTimestamp(prev.start, ts);
    if (start !== prev.start) {
      bySessionId.set(id, { ...prev, start });
    }
    backfilledIds.add(id);
  };
  for (const p of prompts) {
    ensureShell(sanitizeSessionId(p.conversation_id), p.timestamp);
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
      const inferred = !globalStartedIds.has(session.session_id);
      return {
        ...session,
        last_reply,
        last_activity,
        duration_ms,
        reason: session.reason ?? (hasEnd ? session.reason : "open"),
        is_open: !hasEnd,
        lifecycle_source: (inferred
          ? "inferred"
          : "hooks") as SessionLifecycleSource,
        lifecycle_gaps: inferred ? ["sessionStart"] : undefined,
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
      const sawSubagentStart = globalSubagentStartIds.has(session.session_id);
      subRaw.push({
        ...session,
        is_subagent: true,
        parent_session_id: resolved.parentSessionId,
        lifecycle_source: sawSubagentStart ? "hooks" : "inferred",
        lifecycle_gaps: sawSubagentStart ? undefined : ["subagentStart"],
      });
    } else {
      mainRaw.push(session);
    }
  }

  return {
    // Titles are attached later for the paginated slice only.
    main: mainRaw.filter((s) => keepListedSession(s, sessionHasContentEvent)),
    subagentsFromTranscript: subRaw.filter((s) =>
      keepListedSession(s, sessionHasContentEvent)
    ),
  };
}
