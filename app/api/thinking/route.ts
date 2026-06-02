import { NextRequest } from "next/server";
import { getThinking } from "@/lib/thinking";
import { clampPageSize, normalizeDateRange } from "@/lib/api-limits";

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
  const model = searchParams.get("model") ?? undefined;
  const highlight = searchParams.get("highlight") ?? undefined;

  const { groups, total, truncated } = getThinking({
    page,
    pageSize,
    from,
    to,
    model,
    highlight,
  });
  return Response.json({ groups, total, from, to, pageSize, truncated });
}
