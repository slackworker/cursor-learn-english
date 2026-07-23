import type { DomContextBlock, PromptSegment } from "../parse-dom-context";
import type { ParsedSessionTitle } from "../session-titles";
import type { SessionLifecycleSource, SessionSummary } from "./types";

export function parseJsonlLine<T>(line: string): T | null {
  try {
    return JSON.parse(line) as T;
  } catch {
    return null;
  }
}

export function clipTitle(value: string, maxLen = 60): string {
  const trimmed = value.replace(/\s+/g, " ").trim();
  if (!trimmed) return "";
  if (trimmed.length <= maxLen) return trimmed;
  return `${trimmed.slice(0, maxLen)}…`;
}

export function titleMatchKey(session: SessionSummary): string {
  return (
    session.prompt_title_body ||
    session.title_body ||
    session.prompt_title ||
    session.title ||
    ""
  )
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase()
    .slice(0, 80);
}

export function timestampMs(iso?: string): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  return Number.isNaN(t) ? null : t;
}

export function minTimestamp(
  current: string | undefined,
  next: string | undefined
): string | undefined {
  if (!next) return current;
  if (!current || next.localeCompare(current) < 0) return next;
  return current;
}

export function maxTimestamp(
  current: string | undefined,
  next: string | undefined
): string | undefined {
  if (!next) return current;
  if (!current || next.localeCompare(current) > 0) return next;
  return current;
}

export function preferHooksLifecycle(
  a?: SessionLifecycleSource,
  b?: SessionLifecycleSource
): SessionLifecycleSource | undefined {
  if (a === "hooks" || b === "hooks") return "hooks";
  return a ?? b;
}

export function sessionSortKey(session: SessionSummary): string {
  return (
    session.last_activity ??
    session.last_reply ??
    session.timestamp ??
    session.start ??
    ""
  );
}

export function promptFieldsFromParsed(parsed: ParsedSessionTitle): {
  prompt_title: string;
  prompt_title_dom_contexts?: DomContextBlock[];
  prompt_title_segments?: PromptSegment[];
  prompt_title_body?: string;
} {
  return {
    prompt_title: parsed.plain,
    prompt_title_dom_contexts:
      parsed.domContexts.length > 0 ? parsed.domContexts : undefined,
    prompt_title_segments:
      parsed.segments.length > 0 ? parsed.segments : undefined,
    prompt_title_body: parsed.body || undefined,
  };
}
