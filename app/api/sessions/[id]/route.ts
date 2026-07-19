import { NextRequest } from "next/server";
import { getSessionDetail } from "@/lib/sessions";

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  const detail = getSessionDetail(id);
  if (!detail) {
    return Response.json({ error: "Session not found" }, { status: 404 });
  }
  return Response.json(
    { session: detail },
    {
      headers: {
        "Cache-Control": "private, no-cache",
      },
    }
  );
}
