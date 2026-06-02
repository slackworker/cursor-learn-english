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
  const aggregateOnly =
    searchParams.get("aggregateOnly") === "1" ||
    searchParams.get("aggregateOnly") === "true";

  const { events, truncated } = getEvents(from, to, event_type ?? undefined);
  const byDay = aggregateByDay(events);

  if (aggregateOnly) {
    return Response.json({ byDay, from, to, truncated });
  }

  return Response.json({ events, byDay, from, to, truncated });
}
