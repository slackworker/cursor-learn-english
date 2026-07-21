/**
 * Phrase dictionary loader.
 *
 * Offline bulk: data/phrase-dictionary.generated.json (`npm run dict:build`)
 * Local extras only fill phrases missing from generated data.
 */
import fs from "fs";
import path from "path";

export type PhraseCategory =
  | "discourse"
  | "collocation"
  | "phrasal"
  | "preposition"
  | "tech"
  | "idiom";

export type PhraseDictEntry = {
  phrase: string;
  gloss: string;
  category: PhraseCategory;
  source?: string;
};

/** Local gap-fillers (English only). Prefer extending the build script instead. */
export const PHRASE_DICTIONARY: PhraseDictEntry[] = [
  { phrase: "single source of truth", gloss: "one authoritative data source", category: "tech" },
  { phrase: "out of scope", gloss: "outside the agreed boundaries of work", category: "tech" },
  { phrase: "in scope", gloss: "within the agreed boundaries of work", category: "tech" },
  { phrase: "breaking change", gloss: "change that breaks existing clients/APIs", category: "tech" },
  { phrase: "backward compatible", gloss: "compatible with previous versions", category: "tech" },
  { phrase: "front end", gloss: "client-side / UI layer", category: "tech" },
  { phrase: "front-end", gloss: "client-side / UI layer", category: "tech" },
  { phrase: "back end", gloss: "server-side layer", category: "tech" },
  { phrase: "back-end", gloss: "server-side layer", category: "tech" },
  { phrase: "end to end", gloss: "covering the full path from start to finish", category: "tech" },
  { phrase: "end-to-end", gloss: "covering the full path from start to finish", category: "tech" },
  { phrase: "open source", gloss: "source code available for use and modification", category: "tech" },
  { phrase: "open-source", gloss: "source code available for use and modification", category: "tech" },
  { phrase: "real time", gloss: "processed with negligible delay", category: "tech" },
  { phrase: "real-time", gloss: "processed with negligible delay", category: "tech" },
  { phrase: "high level", gloss: "abstract / overview-oriented", category: "tech" },
  { phrase: "high-level", gloss: "abstract / overview-oriented", category: "tech" },
  { phrase: "low level", gloss: "detailed / close to implementation", category: "tech" },
  { phrase: "low-level", gloss: "detailed / close to implementation", category: "tech" },
  { phrase: "proof of concept", gloss: "small demo to validate an idea", category: "tech" },
  { phrase: "work in progress", gloss: "unfinished work still being developed", category: "collocation" },
];

type GeneratedFile = {
  count: number;
  entries: Array<{
    phrase: string;
    gloss: string;
    category: string;
    source?: string;
  }>;
};

let cached: PhraseDictEntry[] | null = null;

function loadGeneratedEntries(): PhraseDictEntry[] {
  const filePath = path.join(
    process.cwd(),
    "data",
    "phrase-dictionary.generated.json"
  );
  try {
    const raw = fs.readFileSync(filePath, "utf8");
    const data = JSON.parse(raw) as GeneratedFile;
    if (!Array.isArray(data.entries)) return [];
    return data.entries.map((e) => ({
      phrase: e.phrase,
      gloss: e.gloss,
      category: (e.category as PhraseCategory) || "collocation",
      source: e.source,
    }));
  } catch {
    return [];
  }
}

/** Merged dictionary: generated offline data first; local only fills gaps. */
export function getPhraseDictionary(): PhraseDictEntry[] {
  if (cached) return cached;

  const map = new Map<string, PhraseDictEntry>();

  for (const e of loadGeneratedEntries()) {
    const key = e.phrase.trim().toLowerCase().replace(/\s+/g, " ");
    if (!key) continue;
    map.set(key, { ...e, phrase: key });
  }

  for (const e of PHRASE_DICTIONARY) {
    const key = e.phrase.trim().toLowerCase().replace(/\s+/g, " ");
    if (!key || map.has(key)) continue;
    map.set(key, { ...e, phrase: key, source: e.source ?? "local" });
  }

  cached = Array.from(map.values());
  return cached;
}
