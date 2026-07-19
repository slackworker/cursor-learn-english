import { getCursorConversationTitles } from "./cursor-conversation-titles";
import type { DomContextBlock, PromptSegment } from "./parse-dom-context";
import {
  clipParsedSessionTitle,
  getSessionTitles,
} from "./session-titles";

export type ResolvedSessionTitle = {
  title: string;
  title_source: "cursor" | "prompt";
  title_dom_contexts?: DomContextBlock[];
  title_segments?: PromptSegment[];
  title_body?: string;
};

/**
 * Resolve short display titles for session UUIDs.
 * Prefer Cursor sidebar name, else clipped first-prompt title.
 */
export function resolveSessionDisplayTitles(
  sessionIds: string[]
): Map<string, ResolvedSessionTitle> {
  const result = new Map<string, ResolvedSessionTitle>();
  const ids = [...new Set(sessionIds.filter(Boolean))];
  if (ids.length === 0) return result;

  const cursorTitles = getCursorConversationTitles(ids);
  const promptTitles = getSessionTitles(ids);

  for (const id of ids) {
    const cursorTitle = cursorTitles.get(id)?.trim();
    if (cursorTitle) {
      result.set(id, {
        title: cursorTitle,
        title_source: "cursor",
      });
      continue;
    }

    const parsed = promptTitles.get(id);
    if (parsed?.plain) {
      const clipped = clipParsedSessionTitle(parsed);
      result.set(id, {
        title: clipped.plain,
        title_source: "prompt",
        title_dom_contexts:
          clipped.domContexts.length > 0 ? clipped.domContexts : undefined,
        title_segments:
          clipped.segments.length > 0 ? clipped.segments : undefined,
        title_body: clipped.body || undefined,
      });
    }
  }

  return result;
}
