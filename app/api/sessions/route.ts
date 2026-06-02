import { NextRequest } from "next/server";
import { getSessionSummaries } from "@/lib/sessions";
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
  const { sessions, truncated } = getSessionSummaries(from, to);
  return Response.json({ sessions, from, to, truncated });
}
