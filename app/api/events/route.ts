import { NextRequest } from "next/server";
import { getEvents, aggregateByDay, aggregatePromptsByHourOfDay } from "@/lib/events";
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
  const tzRaw = searchParams.get("tzOffset");
  const tzParsed = tzRaw != null && tzRaw !== "" ? Number(tzRaw) : 0;
  const tzOffset = Number.isFinite(tzParsed) ? tzParsed : 0;
  const promptsByHour = aggregatePromptsByHourOfDay(events, tzOffset);

  if (aggregateOnly) {
    return Response.json({ byDay, promptsByHour, from, to, truncated });
  }

  return Response.json({ events, byDay, promptsByHour, from, to, truncated });
}
