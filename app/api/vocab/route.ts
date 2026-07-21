import { NextRequest } from "next/server";
import { getVocabStats, normalizeVocabSources } from "@/lib/vocab";
import {
  clampLimit,
  MAX_API_PHRASE_LIMIT,
  MAX_API_WORD_LIMIT,
  normalizeDateRange,
} from "@/lib/api-limits";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const { from, to } = normalizeDateRange(
    searchParams.get("from") ?? undefined,
    searchParams.get("to") ?? undefined
  );
  const model = searchParams.get("model") ?? undefined;
  const sources = normalizeVocabSources(searchParams.get("sources"));
  const wordLimit = clampLimit(
    parseInt(searchParams.get("wordLimit") ?? "200", 10),
    200,
    MAX_API_WORD_LIMIT
  );
  const phraseLimit = clampLimit(
    parseInt(searchParams.get("phraseLimit") ?? "200", 10),
    200,
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
  return Response.json({ ...data, from, to, wordLimit, phraseLimit });
}
