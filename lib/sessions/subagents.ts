import type { CursorEvent } from "../events";
import { spanDurationMs } from "../format-duration";
import {
  listSubagentIdsForParent,
  resolveTranscript,
} from "../agent-transcripts-path";
import { getSessionTitles } from "../session-titles";
import {
  SESSION_LIFECYCLE_EVENT_TYPES,
  SUBAGENT_EVENT_TYPES,
  getSessionIdFromEvent,
  getSubagentSessionId,
  isHookCallSessionId,
  isUuidSessionId,
  sanitizeSessionId,
  subagentIdFromTranscriptPath,
} from "./ids";
import { getGlobalSubagentStartIds } from "./lifecycle";
import { keepListedSession } from "./titles";
import type { SessionLifecycleSource, SessionSummary } from "./types";
import {
  clipTitle,
  maxTimestamp,
  minTimestamp,
  preferHooksLifecycle,
  timestampMs,
  titleMatchKey,
} from "./util";

export function mergeSubagentSummaries(
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
      title_source: s.title?.trim()
        ? s.title_source ?? prev?.title_source
        : prev?.title_source,
      title_body: s.title_body?.trim() ? s.title_body : prev?.title_body,
      title_dom_contexts: s.title_dom_contexts ?? prev?.title_dom_contexts,
      title_segments: s.title_segments ?? prev?.title_segments,
      prompt_title: s.prompt_title?.trim() ? s.prompt_title : prev?.prompt_title,
      prompt_title_body: s.prompt_title_body?.trim()
        ? s.prompt_title_body
        : prev?.prompt_title_body,
      prompt_title_dom_contexts:
        s.prompt_title_dom_contexts ?? prev?.prompt_title_dom_contexts,
      prompt_title_segments:
        s.prompt_title_segments ?? prev?.prompt_title_segments,
      start: s.start ?? prev?.start,
      timestamp: s.timestamp ?? prev?.timestamp,
      last_activity: s.last_activity ?? prev?.last_activity,
      duration_ms: s.duration_ms ?? prev?.duration_ms,
      reason: s.reason ?? prev?.reason,
      is_open: s.is_open ?? prev?.is_open,
      lifecycle_source: preferHooksLifecycle(
        s.lifecycle_source,
        prev?.lifecycle_source
      ),
      lifecycle_gaps:
        preferHooksLifecycle(s.lifecycle_source, prev?.lifecycle_source) ===
        "hooks"
          ? undefined
          : s.lifecycle_gaps ?? prev?.lifecycle_gaps,
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
    title_source: canonical.title?.trim()
      ? canonical.title_source ?? hook.title_source
      : hook.title_source,
    title_body: canonical.title_body?.trim() ? canonical.title_body : hook.title_body,
    title_dom_contexts: canonical.title_dom_contexts ?? hook.title_dom_contexts,
    title_segments: canonical.title_segments ?? hook.title_segments,
    prompt_title: canonical.prompt_title?.trim()
      ? canonical.prompt_title
      : hook.prompt_title,
    prompt_title_body: canonical.prompt_title_body?.trim()
      ? canonical.prompt_title_body
      : hook.prompt_title_body,
    prompt_title_dom_contexts:
      canonical.prompt_title_dom_contexts ?? hook.prompt_title_dom_contexts,
    prompt_title_segments:
      canonical.prompt_title_segments ?? hook.prompt_title_segments,
    start,
    timestamp,
    last_activity,
    duration_ms:
      spanMs ??
      canonical.duration_ms ??
      hook.duration_ms,
    reason: closedReason ?? (hasEnd ? closedReason : "open"),
    is_open: !hasEnd,
    lifecycle_source: preferHooksLifecycle(
      canonical.lifecycle_source,
      hook.lifecycle_source
    ),
    lifecycle_gaps:
      preferHooksLifecycle(
        canonical.lifecycle_source,
        hook.lifecycle_source
      ) === "hooks"
        ? undefined
        : canonical.lifecycle_gaps ?? hook.lifecycle_gaps,
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

export function canonicalizeSubagentSummaries(
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
    // Page route enriches titles for the visible slice.
    sessions: Array.from(byId.values()),
    aliases,
  };
}

export function buildSubagentSessionSummaries(events: CursorEvent[]): SessionSummary[] {
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
    const fromPath = subagentIdFromTranscriptPath(
      (e as { agent_transcript_path?: string }).agent_transcript_path
    );
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
      // start is only set from subagentStart (Stop copies prev.start).
      const sawStart =
        Boolean(session.start) ||
        getGlobalSubagentStartIds().has(session.session_id);
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
        title_source: taskTitle ? ("task" as const) : undefined,
        title_body: session.task?.trim() || undefined,
        lifecycle_source: (sawStart ? "hooks" : "inferred") as SessionLifecycleSource,
        lifecycle_gaps: sawStart ? undefined : ["subagentStart"],
      } satisfies SessionSummary;
    })
    .filter((s) => Boolean(s.start ?? s.timestamp));

  // Subagents are listed from Start/Stop lifecycle; transcript titles enrich on page.
  return sessions.filter((session) => keepListedSession(session, contentById));
}
