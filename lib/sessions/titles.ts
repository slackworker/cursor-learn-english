import { getCursorConversationTitles } from "../cursor-conversation-titles";
import {
  clipParsedSessionTitle,
  getSessionTitles,
  hasSessionTranscript,
  type ParsedSessionTitle,
} from "../session-titles";
import type { SessionSummary } from "./types";
import { promptFieldsFromParsed } from "./util";

/**
 * Title chain: Cursor conversation-search.db → clipped first prompt → task.
 * Always attaches prompt_* fields when a transcript first-user message exists.
 */
export function enrichSessionTitles(sessions: SessionSummary[]): SessionSummary[] {
  if (sessions.length === 0) return sessions;
  const ids = sessions.map((s) => s.session_id).filter(Boolean);
  const cursorTitles = getCursorConversationTitles(ids);
  const transcriptIds = sessions
    .filter((s) => hasSessionTranscript(s.session_id))
    .map((s) => s.session_id);
  const promptTitles =
    transcriptIds.length > 0
      ? getSessionTitles(transcriptIds)
      : new Map<string, ParsedSessionTitle>();

  return sessions.map((session) => {
    const parsed = promptTitles.get(session.session_id);
    const promptFields = parsed?.plain ? promptFieldsFromParsed(parsed) : {};
    const cursorTitle = cursorTitles.get(session.session_id)?.trim();

    if (cursorTitle) {
      return {
        ...session,
        ...promptFields,
        title: cursorTitle,
        title_source: "cursor" as const,
        title_dom_contexts: undefined,
        title_segments: undefined,
        title_body: undefined,
      };
    }

    if (parsed?.plain) {
      const clipped = clipParsedSessionTitle(parsed);
      return {
        ...session,
        ...promptFields,
        title: clipped.plain,
        title_source: "prompt" as const,
        title_dom_contexts:
          clipped.domContexts.length > 0 ? clipped.domContexts : undefined,
        title_segments:
          clipped.segments.length > 0 ? clipped.segments : undefined,
        title_body: clipped.body || undefined,
      };
    }

    if (session.title?.trim()) {
      return {
        ...session,
        ...promptFields,
        title_source: session.title_source ?? ("task" as const),
      };
    }

    return { ...session, ...promptFields };
  });
}

export function keepListedSession(
  session: SessionSummary,
  contentById: Map<string, boolean>
): boolean {
  if (session.is_open) return true;
  if (session.title?.trim()) return true;
  if (contentById.get(session.session_id) === true) return true;
  // Main rows are already transcript-gated; keep them for deferred title enrich.
  // Hook-only subagent shells without content stay hidden.
  return !session.is_subagent;
}

/** Attach Cursor + transcript titles for a page of summaries (avoid full-list file reads). */
export function enrichSessionPageTitles(
  sessions: SessionSummary[]
): SessionSummary[] {
  return enrichSessionTitles(sessions);
}
