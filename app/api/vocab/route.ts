import { NextRequest } from "next/server";
import { getVocabStats, normalizeVocabSources } from "@/lib/vocab";
import {
  clampLimit,
  MAX_API_PHRASE_LIMIT,
  MAX_API_WORD_LIMIT,
  normalizeDateRange,
} from "@/lib/api-limits";

function parseOptionalLimit(
  raw: string | null,
  max: number
): number | undefined {
  // Omit / 0 / "all" → full list (client paginates).
  if (!raw || raw === "all" || raw === "0") return undefined;
  const n = clampLimit(parseInt(raw, 10), 0, max);
  return n > 0 ? n : undefined;
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const { from, to } = normalizeDateRange(
    searchParams.get("from") ?? undefined,
    searchParams.get("to") ?? undefined
  );
  const model = searchParams.get("model") ?? undefined;
  const sources = normalizeVocabSources(searchParams.get("sources"));
  const wordLimit = parseOptionalLimit(
    searchParams.get("wordLimit"),
    MAX_API_WORD_LIMIT
  );
  const phraseLimit = parseOptionalLimit(
    searchParams.get("phraseLimit"),
    MAX_API_PHRASE_LIMIT
  );

  const data = getVocabStats({
    from,
    to,
    model,
    sources,
    wordLimit,
    phraseLimit,
  });
  return Response.json({
    ...data,
    from,
    to,
    wordLimit: wordLimit ?? null,
    phraseLimit: phraseLimit ?? null,
  });
}
