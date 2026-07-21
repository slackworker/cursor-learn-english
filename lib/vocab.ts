import fs from "fs";
import path from "path";
import {
  listDailyPaths,
  readMergedJsonlLines,
  stemFromBasePath,
} from "./jsonl-daily";
import { getEvents, getEventsPath } from "./events";
import {
  getCorpusPath,
  getPromptCorpusPath,
  type ThinkingRecord,
} from "./thinking";
import {
  getPhraseDictionary,
  type PhraseCategory,
  type PhraseDictEntry,
} from "./phrase-dictionary";

export type VocabSource = "prompt" | "thinking" | "response";

export const ALL_VOCAB_SOURCES: VocabSource[] = [
  "prompt",
  "thinking",
  "response",
];

export type WordFreq = { word: string; count: number };
export type PhraseFreq = {
  phrase: string;
  count: number;
  gloss: string;
  category: PhraseCategory;
};
export type VocabResult = {
  words: WordFreq[];
  phrases: PhraseFreq[];
  /** Total unique words before any optional limit slice. */
  uniqueWords: number;
  /** Total dictionary phrase hits before any optional limit slice. */
  uniquePhrases: number;
  totalTokens: number;
  totalRecords: number;
  bySource: Record<VocabSource, number>;
  sources: VocabSource[];
  dictionarySize: number;
};

type PromptRecord = {
  conversation_id: string;
  prompt: string;
  timestamp: string;
};

type TextChunk = {
  source: VocabSource;
  text: string;
  timestamp: string;
  model?: string;
};

function stripMarkdown(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`[^`]+`/g, " ")
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/[a-zA-Z_][a-zA-Z0-9_]*\/[a-zA-Z0-9_/.\-]+/g, " ") // file paths
    .replace(/\b[A-Z][a-z]+[A-Z]\w*/g, " ") // camelCase identifiers
    .replace(/\.[a-z][a-z0-9_-]*/gi, " ") // CSS class selectors (.page-shell)
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^\s*-{3,}\s*$/gm, " ")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/__([^_]+)__/g, "$1")
    .replace(/_([^_]+)_/g, "$1")
    .replace(/~~([^~]+)~~/g, "$1")
    .replace(/^\s*[-*+]\s+/gm, "")
    .replace(/^\s*\d+\.\s+/gm, "")
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/^\s*>\s?/gm, "");
}

function isToken(w: string): boolean {
  return (
    w.length >= 2 &&
    w.length <= 40 &&
    /[a-z]/.test(w) &&
    !/^\d+$/.test(w) &&
    !w.startsWith("'") &&
    !w.endsWith("'")
  );
}

/** Flat token stream (for word counts). Keeps short particles like "to"/"up". */
function tokenize(text: string): string[] {
  return stripMarkdown(text)
    .toLowerCase()
    .split(/[^a-z'-]+/)
    .filter(isToken);
}

/**
 * Full sentence token sequences for dictionary matching.
 * No noise-token cuts — fixed phrases in long sentences stay contiguous.
 * Only ".!?" split sentences (phrases almost never cross sentence ends).
 */
function tokenizeSentences(text: string): string[][] {
  return stripMarkdown(text)
    .toLowerCase()
    .split(/[.!?]+/)
    .map((sentence) => sentence.split(/[^a-z'-]+/).filter(isToken))
    .filter((toks) => toks.length >= 2);
}

function emptyBySource(): Record<VocabSource, number> {
  return { prompt: 0, thinking: 0, response: 0 };
}

export function normalizeVocabSources(
  sources?: VocabSource[] | string | null
): VocabSource[] {
  const raw =
    typeof sources === "string"
      ? sources.split(/[,+\s]+/)
      : Array.isArray(sources)
        ? sources
        : [];
  const selected = raw
    .map((s) => s.trim().toLowerCase())
    .filter((s): s is VocabSource =>
      s === "prompt" || s === "thinking" || s === "response"
    );
  const unique = Array.from(new Set(selected));
  return unique.length > 0 ? unique : [...ALL_VOCAB_SOURCES];
}

function inDateRange(
  timestamp: string,
  from?: string,
  to?: string
): boolean {
  const day = timestamp.slice(0, 10);
  if (from && day < from) return false;
  if (to && day > to) return false;
  return true;
}

function readTextChunks(opts?: {
  from?: string;
  to?: string;
  model?: string;
  sources?: VocabSource[];
}): TextChunk[] {
  const sources = normalizeVocabSources(opts?.sources);
  const chunks: TextChunk[] = [];

  if (sources.includes("thinking")) {
    const records = readMergedJsonlLines(
      getCorpusPath(),
      (line) => {
        try {
          return JSON.parse(line) as ThinkingRecord;
        } catch {
          return null;
        }
      },
      { from: opts?.from, to: opts?.to }
    ).items;

    for (const r of records) {
      if (!inDateRange(r.timestamp, opts?.from, opts?.to)) continue;
      if (opts?.model && r.model !== opts.model) continue;
      const text = r.text?.trim();
      if (!text) continue;
      chunks.push({
        source: "thinking",
        text,
        timestamp: r.timestamp,
        model: r.model,
      });
    }
  }

  if (sources.includes("prompt")) {
    const records = readMergedJsonlLines(
      getPromptCorpusPath(),
      (line) => {
        try {
          return JSON.parse(line) as PromptRecord;
        } catch {
          return null;
        }
      },
      { from: opts?.from, to: opts?.to }
    ).items;

    for (const r of records) {
      if (!inDateRange(r.timestamp, opts?.from, opts?.to)) continue;
      // prompts have no model; skip when a model filter is active
      if (opts?.model) continue;
      const text = r.prompt?.trim();
      if (!text) continue;
      chunks.push({
        source: "prompt",
        text,
        timestamp: r.timestamp,
      });
    }
  }

  if (sources.includes("response")) {
    const { events } = getEvents(opts?.from, opts?.to, "afterAgentResponse");
    for (const e of events) {
      if (!inDateRange(e.timestamp, opts?.from, opts?.to)) continue;
      if (opts?.model && e.model !== opts.model) continue;
      const text =
        typeof e.response_text === "string" ? e.response_text.trim() : "";
      if (!text) continue;
      chunks.push({
        source: "response",
        text,
        timestamp: e.timestamp,
        model: e.model ?? undefined,
      });
    }
  }

  return chunks;
}

function countWords(tokens: string[]): WordFreq[] {
  const freq = new Map<string, number>();
  for (const t of tokens) {
    // No stop-word / short-word cuts — users pass items themselves.
    freq.set(t, (freq.get(t) || 0) + 1);
  }
  return Array.from(freq.entries())
    .map(([word, count]) => ({ word, count }))
    .sort((a, b) => b.count - a.count);
}

type IndexedPhrase = {
  entry: PhraseDictEntry;
  tokens: string[];
};

type SeparableCand = {
  entry: PhraseDictEntry;
  particle: string;
};

/** Particles that commonly allow an object between verb and particle (look it up). */
const SEPARABLE_PARTICLES = new Set([
  "up",
  "out",
  "off",
  "down",
  "away",
  "back",
  "over",
  "around",
  "about",
  "along",
  "aside",
  "through",
  "in",
  "on",
]);

/** Longest-first index keyed by first token. */
function buildPhraseIndex(dict: PhraseDictEntry[]): Map<string, IndexedPhrase[]> {
  const indexed: IndexedPhrase[] = dict.map((entry) => ({
    entry,
    tokens: entry.phrase.split(/\s+/).filter(Boolean),
  }));
  indexed.sort((a, b) => b.tokens.length - a.tokens.length);

  const byFirst = new Map<string, IndexedPhrase[]>();
  for (const item of indexed) {
    if (item.tokens.length === 0) continue;
    const first = item.tokens[0];
    const list = byFirst.get(first);
    if (list) list.push(item);
    else byFirst.set(first, [item]);
  }
  return byFirst;
}

/**
 * Index 2-token verb+particle phrases for gapped matching (look it up).
 * Only particles in SEPARABLE_PARTICLES; prefers phrasal/collocation entries.
 */
function buildSeparableIndex(
  dict: PhraseDictEntry[]
): Map<string, SeparableCand[]> {
  const byVerb = new Map<string, SeparableCand[]>();
  for (const entry of dict) {
    const tokens = entry.phrase.split(/\s+/).filter(Boolean);
    if (tokens.length !== 2) continue;
    const [verb, particle] = tokens;
    if (!SEPARABLE_PARTICLES.has(particle)) continue;
    if (
      entry.category !== "phrasal" &&
      entry.category !== "collocation" &&
      entry.category !== "preposition"
    ) {
      continue;
    }
    const list = byVerb.get(verb);
    const cand = { entry, particle };
    if (list) list.push(cand);
    else byVerb.set(verb, [cand]);
  }
  return byVerb;
}

function isPlausibleObjectSpan(toks: string[], start: number, end: number): boolean {
  const len = end - start;
  if (len < 1 || len > 3) return false;
  for (let k = start; k < end; k++) {
    const t = toks[k];
    if (SEPARABLE_PARTICLES.has(t)) return false;
    if (t.length > 18) return false;
  }
  return true;
}

/**
 * Scan sentence token sequences for dictionary phrases.
 * 1) Contiguous longest match
 * 2) Separable verb + object(1–3) + particle (look it up → look up)
 */
function matchDictionaryPhrases(sequences: string[][]): PhraseFreq[] {
  const dict = getPhraseDictionary();
  const index = buildPhraseIndex(dict);
  const separable = buildSeparableIndex(dict);
  const counts = new Map<string, number>();
  const meta = new Map<string, PhraseDictEntry>();

  for (const entry of dict) {
    meta.set(entry.phrase, entry);
  }

  for (const toks of sequences) {
    let i = 0;
    while (i < toks.length) {
      const cands = index.get(toks[i]);
      let matched: IndexedPhrase | null = null;
      if (cands) {
        for (const cand of cands) {
          if (i + cand.tokens.length > toks.length) continue;
          let ok = true;
          for (let j = 0; j < cand.tokens.length; j++) {
            if (toks[i + j] !== cand.tokens[j]) {
              ok = false;
              break;
            }
          }
          if (ok) {
            matched = cand;
            break; // longest-first within bucket
          }
        }
      }

      if (matched) {
        const key = matched.entry.phrase;
        counts.set(key, (counts.get(key) || 0) + 1);
        i += matched.tokens.length;
        continue;
      }

      // Separable: verb … particle with a short object in between
      const sepCands = separable.get(toks[i]);
      let sepHit: SeparableCand | null = null;
      let sepEnd = -1;
      if (sepCands) {
        for (let gap = 1; gap <= 3; gap++) {
          const pIdx = i + 1 + gap;
          if (pIdx >= toks.length) break;
          if (!isPlausibleObjectSpan(toks, i + 1, pIdx)) continue;
          const particle = toks[pIdx];
          const hit = sepCands.find((c) => c.particle === particle);
          if (hit) {
            sepHit = hit;
            sepEnd = pIdx + 1;
            break;
          }
        }
      }

      if (sepHit && sepEnd > i) {
        const key = sepHit.entry.phrase;
        counts.set(key, (counts.get(key) || 0) + 1);
        i = sepEnd;
      } else {
        i += 1;
      }
    }
  }

  return Array.from(counts.entries())
    .map(([phrase, count]) => {
      const entry = meta.get(phrase)!;
      return {
        phrase,
        count,
        gloss: entry.gloss,
        category: entry.category,
      };
    })
    .sort((a, b) => b.count - a.count || a.phrase.localeCompare(b.phrase));
}

/** Full frequency lists; optional API limits only slice the response. */
type VocabCachePayload = {
  words: WordFreq[];
  phrases: PhraseFreq[];
  totalTokens: number;
  totalRecords: number;
  bySource: Record<VocabSource, number>;
  sources: VocabSource[];
  dictionarySize: number;
};

// In-memory cache keyed by file mtime + filter params (not page limits)
let cache: { key: string; data: VocabCachePayload } | null = null;

function appendPathSignature(
  parts: string[],
  filePath: string,
  from?: string,
  to?: string
) {
  const paths = [filePath, ...listDailyPaths(filePath, from, to)];
  for (const p of paths) {
    try {
      const s = fs.statSync(p);
      parts.push(`${path.basename(p)}:${s.mtimeMs}:${s.size}`);
    } catch {
      parts.push(`${p}:missing`);
    }
  }
}

function getCacheKey(opts?: {
  from?: string;
  to?: string;
  model?: string;
  sources?: VocabSource[];
}): string {
  const sources = normalizeVocabSources(opts?.sources);
  const parts: string[] = [];
  const stems: string[] = [];

  if (sources.includes("thinking")) {
    const filePath = getCorpusPath();
    stems.push(stemFromBasePath(filePath).stem);
    appendPathSignature(parts, filePath, opts?.from, opts?.to);
  }
  if (sources.includes("prompt")) {
    const filePath = getPromptCorpusPath();
    stems.push(stemFromBasePath(filePath).stem);
    appendPathSignature(parts, filePath, opts?.from, opts?.to);
  }
  if (sources.includes("response")) {
    const filePath = getEventsPath();
    stems.push(stemFromBasePath(filePath).stem);
    appendPathSignature(parts, filePath, opts?.from, opts?.to);
  }

  return [
    "phrases-dict-v9",
    stems.join("+"),
    sources.slice().sort().join(","),
    parts.join(","),
    opts?.from || "",
    opts?.to || "",
    opts?.model || "",
  ].join(":");
}

function applyLimit<T>(items: T[], limit?: number): T[] {
  if (limit == null || limit <= 0) return items;
  return items.slice(0, limit);
}

export function getVocabStats(opts?: {
  from?: string;
  to?: string;
  model?: string;
  sources?: VocabSource[];
  /** Optional response slice; omit / ≤0 = return all (UI paginates). */
  wordLimit?: number;
  phraseLimit?: number;
}): VocabResult {
  const sources = normalizeVocabSources(opts?.sources);
  const key = getCacheKey({ ...opts, sources });

  let full = cache && cache.key === key ? cache.data : null;
  if (!full) {
    const chunks = readTextChunks({ ...opts, sources });
    const allTokens: string[] = [];
    const sentences: string[][] = [];
    const bySource = emptyBySource();

    for (const chunk of chunks) {
      bySource[chunk.source] += 1;
      allTokens.push(...tokenize(chunk.text));
      sentences.push(...tokenizeSentences(chunk.text));
    }

    full = {
      words: countWords(allTokens),
      phrases: matchDictionaryPhrases(sentences),
      totalTokens: allTokens.length,
      totalRecords: chunks.length,
      bySource,
      sources,
      dictionarySize: getPhraseDictionary().length,
    };
    cache = { key, data: full };
  }

  return {
    words: applyLimit(full.words, opts?.wordLimit),
    phrases: applyLimit(full.phrases, opts?.phraseLimit),
    uniqueWords: full.words.length,
    uniquePhrases: full.phrases.length,
    totalTokens: full.totalTokens,
    totalRecords: full.totalRecords,
    bySource: full.bySource,
    sources: full.sources,
    dictionarySize: full.dictionarySize,
  };
}
