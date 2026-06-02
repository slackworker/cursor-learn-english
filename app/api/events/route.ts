import { NextRequest } from "next/server";
import { getEvents, aggregateByDay } from "@/lib/events";
import { normalizeDateRange } from "@/lib/api-limits";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const { from, to } = normalizeDateRange(
    searchParams.get("from") ?? undefined,
    searchParams.get("to") ?? undefined
  );
  const event_type = searchParams.get("event_type") ?? undefined;

  const events = getEvents(from, to, event_type ?? undefined);
  const byDay = aggregateByDay(events);

  return Response.json({ events, byDay, from, to });
}
