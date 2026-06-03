import { NextRequest } from "next/server";
import { normalizeDateRange } from "@/lib/api-limits";
import { aggregatePromptsByDay } from "@/lib/prompts";

const YEAR_SPAN_DAYS = 364;

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const aggregateOnly =
    searchParams.get("aggregateOnly") === "1" ||
    searchParams.get("aggregateOnly") === "true";

  const { from, to } = normalizeDateRange(
    searchParams.get("from") ?? undefined,
    searchParams.get("to") ?? undefined,
    {
      maxSpanDays: YEAR_SPAN_DAYS + 1,
      defaultSpanDays: aggregateOnly ? YEAR_SPAN_DAYS : undefined,
    }
  );

  const { byDay, total, truncated } = aggregatePromptsByDay(from, to);

  if (aggregateOnly) {
    return Response.json({ byDay, total, from, to, truncated });
  }

  return Response.json({ byDay, total, from, to, truncated });
}
