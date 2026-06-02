import { NextRequest } from "next/server";
import { clampPageSize, normalizeDateRange } from "@/lib/api-limits";
import { getDialogueRounds } from "@/lib/dialogue";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const page = parseInt(searchParams.get("page") ?? "1", 10);
  const pageSize = clampPageSize(
    parseInt(searchParams.get("pageSize") ?? "10", 10),
    10
  );
  const { from, to } = normalizeDateRange(
    searchParams.get("from") ?? undefined,
    searchParams.get("to") ?? undefined
  );
  const highlight = searchParams.get("highlight") ?? undefined;

  const { rounds, total, truncated } = getDialogueRounds({
    page,
    pageSize,
    from,
    to,
    highlight,
  });

  return Response.json({ rounds, total, from, to, pageSize, truncated });
}
