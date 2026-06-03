import { NextRequest } from "next/server";
import { getSessionSummaries } from "@/lib/sessions";
import { getEventsPath } from "@/lib/events";
import { getMergedReadSignature } from "@/lib/jsonl-daily";
import {
  DEFAULT_SESSIONS_LOOKBACK_DAYS,
  normalizeDateRange,
} from "@/lib/api-limits";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const { from, to } = normalizeDateRange(
    searchParams.get("from") ?? undefined,
    searchParams.get("to") ?? undefined,
    { defaultSpanDays: DEFAULT_SESSIONS_LOOKBACK_DAYS }
  );
  const offsetParam = Number.parseInt(searchParams.get("offset") ?? "0", 10);
  const limitParam = Number.parseInt(searchParams.get("limit") ?? "20", 10);
  const offset = Number.isFinite(offsetParam) && offsetParam > 0 ? offsetParam : 0;
  const limit = Number.isFinite(limitParam) && limitParam > 0
    ? Math.min(limitParam, 100)
    : 20;
  const { sessions, truncated } = getSessionSummaries(from, to);
  const pagedSessions = sessions.slice(offset, offset + limit);
  const hasMore = offset + pagedSessions.length < sessions.length;
  const etag = `"${getMergedReadSignature(getEventsPath(), from, to)}"`;
  if (request.headers.get("if-none-match") === etag) {
    return new Response(null, {
      status: 304,
      headers: {
        ETag: etag,
        "Cache-Control": "private, max-age=30",
      },
    });
  }
  return Response.json(
    {
      sessions: pagedSessions,
      from,
      to,
      truncated,
      hasMore,
      total: sessions.length,
      offset,
      limit,
    },
    {
      headers: {
        ETag: etag,
        "Cache-Control": "private, max-age=30",
      },
    }
  );
}
