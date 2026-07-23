import type { CursorEvent } from "../events";

export const SESSION_EVENT_TYPES = new Set(["sessionStart", "sessionEnd"]);
export const SUBAGENT_EVENT_TYPES = new Set(["subagentStart", "subagentStop"]);
export const SESSION_LIFECYCLE_EVENT_TYPES = new Set([
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

export function isHookCallSessionId(id: string): boolean {
  return sanitizeSessionId(id).startsWith("call-");
}

export function isUuidSessionId(id: string): boolean {
  return UUID_RE.test(sanitizeSessionId(id));
}

export function getSessionIdFromEvent(event: CursorEvent): string {
  return sanitizeSessionId(
    (event as { session_id?: string }).session_id ?? event.conversation_id ?? ""
  );
}

export function getSubagentSessionId(event: CursorEvent): string {
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

export function subagentIdFromTranscriptPath(transcriptPath: unknown): string {
  if (typeof transcriptPath !== "string" || !transcriptPath) return "";
  const normalized = transcriptPath.replace(/\\/g, "/");
  const marker = "/subagents/";
  const idx = normalized.lastIndexOf(marker);
  if (idx < 0) return "";
  const rest = normalized.slice(idx + marker.length);
  const file = rest.split("/")[0] || "";
  return sanitizeSessionId(file.replace(/\.(jsonl|txt)$/i, ""));
}
