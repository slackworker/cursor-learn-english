/**
 * Word dictionary loader (IPA + English gloss).
 *
 * Offline bulk: data/word-dictionary.generated.json (`npm run dict:build:words`)
 * Local extras only fill words missing from generated data.
 */
import fs from "fs";
import path from "path";

export type WordGlossSense = {
  gloss: string;
  pos?: string;
};

export type WordDictEntry = {
  word: string;
  /** Primary learner-facing gloss. */
  gloss: string;
  /** Up to a few senses when Wordset has multiples (primary first). */
  glosses?: WordGlossSense[];
  ipa?: string;
  pos?: string;
  source?: string;
};

/**
 * Narrow American IPA (ɹ/ɫ/ɝ…) → learner-dictionary style.
 * e.g. /ˈɔɹ/ → /ˈɔːr/, /ˈfaɪɫ/ → /ˈfaɪl/
 */
export function normalizeLearnerIpa(ipa: string): string {
  let s = ipa || "";
  if (!s) return "";
  s = s.replace(/ɝ/g, "ɜːr");
  s = s.replace(/ɚ/g, "ər");
  s = s.replace(/ɹ/g, "r");
  s = s.replace(/ɫ/g, "l");
  s = s.replace(/ɡ/g, "g");
  s = s.replace(/ɔr/g, "ɔːr");
  s = s.replace(/ɑr/g, "ɑːr");
  s = s.replace(/ːː/g, "ː");
  return s;
}

/** Local gap-fillers (English only). Prefer extending the build script instead. */
export const WORD_DICTIONARY: WordDictEntry[] = [
  {
    word: "jsonl",
    gloss: "JSON Lines; newline-delimited JSON records",
    ipa: "/ˈdʒeɪsənˌɛl/",
    pos: "noun",
  },
  {
    word: "tsx",
    gloss: "TypeScript JSX source file extension",
    pos: "noun",
  },
  {
    word: "css",
    gloss: "Cascading Style Sheets",
    ipa: "/ˌsiˌɛsˈɛs/",
    pos: "noun",
  },
  {
    word: "html",
    gloss: "HyperText Markup Language",
    ipa: "/ˌeɪtʃˌtiˌɛmˈɛl/",
    pos: "noun",
  },
  {
    word: "http",
    gloss: "Hypertext Transfer Protocol",
    ipa: "/ˌeɪtʃˌtiˌtiˈpi/",
    pos: "noun",
  },
  {
    word: "url",
    gloss: "address of a web resource",
    ipa: "/ˌjuˌɑɹˈɛl/",
    pos: "noun",
  },
  {
    word: "uuid",
    gloss: "universally unique identifier",
    ipa: "/ˈjuːjuːˌaɪˈdiː/",
    pos: "noun",
  },
  {
    word: "oauth",
    gloss: "open standard for delegated authorization",
    pos: "noun",
  },
  {
    word: "webhook",
    gloss: "HTTP callback triggered by an event",
    pos: "noun",
  },
  {
    word: "monorepo",
    gloss: "single repository holding multiple projects",
    pos: "noun",
  },
];

type GeneratedFile = {
  count: number;
  entries: Array<{
    word: string;
    gloss: string;
    glosses?: WordGlossSense[];
    ipa?: string;
    pos?: string;
    source?: string;
  }>;
};

function normalizeGlosses(
  gloss: string,
  glosses?: WordGlossSense[]
): WordGlossSense[] | undefined {
  if (!Array.isArray(glosses) || glosses.length <= 1) return undefined;
  const out: WordGlossSense[] = [];
  for (const g of glosses) {
    const text = String(g?.gloss || "").trim();
    if (!text) continue;
    if (out.some((x) => x.gloss === text)) continue;
    out.push({
      gloss: text,
      ...(g.pos ? { pos: String(g.pos).toLowerCase() } : {}),
    });
  }
  if (out.length <= 1) return undefined;
  // Ensure primary gloss stays first.
  const primary = gloss.trim();
  if (primary && out[0]?.gloss !== primary) {
    const idx = out.findIndex((x) => x.gloss === primary);
    if (idx > 0) {
      const [hit] = out.splice(idx, 1);
      out.unshift(hit);
    } else {
      out.unshift({ gloss: primary });
    }
  }
  return out.slice(0, 3);
}

let cachedList: WordDictEntry[] | null = null;
let cachedMap: Map<string, WordDictEntry> | null = null;

function loadGeneratedEntries(): WordDictEntry[] {
  const filePath = path.join(
    process.cwd(),
    "data",
    "word-dictionary.generated.json"
  );
  try {
    const raw = fs.readFileSync(filePath, "utf8");
    const data = JSON.parse(raw) as GeneratedFile;
    if (!Array.isArray(data.entries)) return [];
    return data.entries.map((e) => ({
      word: e.word,
      gloss: e.gloss,
      glosses: normalizeGlosses(e.gloss, e.glosses),
      ipa: e.ipa ? normalizeLearnerIpa(e.ipa) : undefined,
      pos: e.pos,
      source: e.source,
    }));
  } catch {
    return [];
  }
}

function buildMap(): Map<string, WordDictEntry> {
  const map = new Map<string, WordDictEntry>();

  for (const e of loadGeneratedEntries()) {
    const key = e.word.trim().toLowerCase();
    if (!key) continue;
    map.set(key, { ...e, word: key });
  }

  for (const e of WORD_DICTIONARY) {
    const key = e.word.trim().toLowerCase();
    if (!key || map.has(key)) continue;
    map.set(key, {
      ...e,
      word: key,
      ipa: e.ipa ? normalizeLearnerIpa(e.ipa) : undefined,
      source: e.source ?? "local",
    });
  }

  return map;
}

/** Merged dictionary entries (generated first; local fills gaps). */
export function getWordDictionary(): WordDictEntry[] {
  if (cachedList) return cachedList;
  cachedMap = buildMap();
  cachedList = Array.from(cachedMap.values());
  return cachedList;
}

function getWordMap(): Map<string, WordDictEntry> {
  if (cachedMap) return cachedMap;
  getWordDictionary();
  return cachedMap!;
}

/**
 * Candidate lemmas / stems for a surface form (running → run / runne / …).
 * Order matters: prefer exact, then light morphology.
 */
export function wordLookupCandidates(word: string): string[] {
  const w = word.trim().toLowerCase();
  if (!w) return [];
  const out: string[] = [w];

  if (w.endsWith("'s") && w.length > 3) out.push(w.slice(0, -2));
  if (w.endsWith("s'") && w.length > 3) out.push(w.slice(0, -2));

  if (w.endsWith("ies") && w.length > 4) out.push(w.slice(0, -3) + "y");
  if (w.endsWith("ves") && w.length > 4) out.push(w.slice(0, -3) + "f");
  if (w.endsWith("es") && w.length > 3) out.push(w.slice(0, -2));
  if (w.endsWith("s") && !w.endsWith("ss") && w.length > 3) {
    out.push(w.slice(0, -1));
  }

  if (w.endsWith("ing") && w.length > 5) {
    out.push(w.slice(0, -3));
    out.push(w.slice(0, -3) + "e");
    if (/(.)\1ing$/.test(w)) out.push(w.slice(0, -4));
  }

  if (w.endsWith("ed") && w.length > 4) {
    out.push(w.slice(0, -2));
    out.push(w.slice(0, -1)); // agreed → agree
    if (/(.)\1ed$/.test(w)) out.push(w.slice(0, -3));
  }

  if (w.endsWith("ly") && w.length > 4) out.push(w.slice(0, -2));
  if (w.endsWith("er") && w.length > 4) {
    out.push(w.slice(0, -2));
    out.push(w.slice(0, -1));
  }
  if (w.endsWith("est") && w.length > 5) {
    out.push(w.slice(0, -3));
    out.push(w.slice(0, -2));
  }

  return [...new Set(out.filter((c) => c.length >= 2))];
}

/** Lookup a surface form; falls back through light inflection candidates. */
export function lookupWord(word: string): WordDictEntry | undefined {
  const map = getWordMap();
  for (const key of wordLookupCandidates(word)) {
    const hit = map.get(key);
    if (hit) return hit;
  }
  return undefined;
}
