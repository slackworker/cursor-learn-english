import { NextRequest } from "next/server";
import { getEvents } from "@/lib/events";
import { getSessionTitles } from "@/lib/session-titles";
import {
  DEFAULT_SESSIONS_LOOKBACK_DAYS,
  normalizeDateRange,
} from "@/lib/api-limits";

const SESSION_EVENT_TYPES = new Set(["sessionStart", "sessionEnd"]);

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const { from, to } = normalizeDateRange(
    searchParams.get("from") ?? undefined,
    searchParams.get("to") ?? undefined,
    { defaultSpanDays: DEFAULT_SESSIONS_LOOKBACK_DAYS }
  );

  const { events, truncated } = getEvents(from, to);
  const sessionEvents = events.filter((e) =>
    SESSION_EVENT_TYPES.has(e.event_type)
  );
  const sessionEnds = sessionEvents.filter((e) => e.event_type === "sessionEnd");
  const sessionStarts = sessionEvents.filter((e) => e.event_type === "sessionStart");

  const bySessionId = new Map<
    string,
    { session_id: string; title?: string; reason?: string; duration_ms?: number; timestamp?: string; start?: string }
  >();
  for (const e of sessionStarts) {
    const id = (e as { session_id?: string }).session_id ?? e.conversation_id ?? "";
    if (id) bySessionId.set(id, { ...bySessionId.get(id), session_id: id, start: e.timestamp });
  }
  for (const e of sessionEnds) {
    const id = (e as { session_id?: string }).session_id ?? e.conversation_id ?? "";
    if (id)
      bySessionId.set(id, {
        ...bySessionId.get(id),
        session_id: id,
        reason: (e as { reason?: string }).reason,
        duration_ms: (e as { duration_ms?: number }).duration_ms,
        timestamp: e.timestamp,
      });
  }

  const sessions = Array.from(bySessionId.values())
    .filter((s) => s.timestamp)
    .sort((a, b) => (b.timestamp ?? "").localeCompare(a.timestamp ?? ""));
  const titles = getSessionTitles(sessions.map((s) => s.session_id));
  const sessionsWithTitle = sessions.map((session) => ({
    ...session,
    title: titles.get(session.session_id),
  }));

  return Response.json({ sessions: sessionsWithTitle, from, to, truncated });
}
