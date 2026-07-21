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

export type VocabSource = "prompt" | "thinking" | "response";

export const ALL_VOCAB_SOURCES: VocabSource[] = [
  "prompt",
  "thinking",
  "response",
];

export type WordFreq = { word: string; count: number };
export type PhraseFreq = { phrase: string; count: number };
export type VocabResult = {
  words: WordFreq[];
  phrases: PhraseFreq[];
  totalTokens: number;
  totalRecords: number;
  bySource: Record<VocabSource, number>;
  sources: VocabSource[];
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

const STOP_WORDS = new Set([
  // common English
  "the","be","to","of","and","a","in","that","have","i","it","for","not","on",
  "with","he","as","you","do","at","this","but","his","by","from","they","we",
  "her","she","or","an","will","my","one","all","would","there","their","what",
  "so","up","out","if","about","who","get","which","go","me","when","make",
  "can","like","time","no","just","him","know","take","people","into","year",
  "your","good","some","could","them","see","other","than","then","now","look",
  "only","come","its","over","think","also","back","after","use","two","how",
  "our","work","first","well","way","even","new","want","because","any","these",
  "give","day","most","us","is","was","are","been","has","had","did","were",
  "said","each","tell","does","set","three","put","too","here","must","why",
  "let","should","may","am","very","much","more","still","own","need","such",
  "say","right","being","while","where","same","those","long","made","before",
  "since","many","thing","off","through","down","both","between","another",
  "found","really","going","already","got",
  // programming keywords (noise in thinking text)
  "const","var","let","function","return","import","export","class","type",
  "interface","null","undefined","true","false","string","number","boolean",
  "async","await","try","catch","if","else","switch","case","default","break",
  "continue","while","for","new","this","void","typeof","instanceof",
  "file","code","error","value","data","name","param","args","src","app",
]);

/** UI / CSS / DOM chrome that forms strong but useless collocations. */
const PHRASE_NOISE = new Set([
  "px","em","rem","vh","vw","div","span","html","dom","css","svg","btn","nav",
  "img","ul","ol","li","tr","td","th","tbody","thead","href","src","style",
  "width","height","border","rounded","flex","grid","gap","col","row","left",
  "top","right","bottom","position","absolute","relative","fixed","sticky",
  "overflow","hidden","auto","react","component","element","path","root",
  "cursor","rgba","rgb","hsl","webkit","moz","tap","highlight","select",
  "none","canvas","xl","sm","md","lg","2xl","max","min","box","block",
  "inline","opacity","shadow","ring","outline","transition","transform",
  "scale","rotate","translate","justify","items","content","self","place",
  "whitespace","truncate","pointer","events","user","zr","el","aapppage",
  "xmlns","viewbox","currentcolor","stroke","fill","button","tcp","dial",
  "durationms","clientip","treeglyph","bcfe","openclaw","openclaw-gateway",
]);

/** Short tech acronyms kept despite no vowels. */
const SHORT_TECH_OK = new Set([
  "git","npm","api","url","sql","xml","ssh","ftp","cli","cmd","png","jpg",
  "pdf","svg","css","dom","json","yaml","http","ts","js","py","ui","ux","db",
]);

/** Tailwind-ish utility class prefixes. */
const TW_PREFIX =
  /^(max|min|w|h|p|m|px|py|pt|pb|pl|pr|mx|my|mt|mb|ml|mr|gap|space|text|bg|border|rounded|flex|grid|col|row|items|justify|font|leading|tracking|opacity|z|inset|ring|shadow|outline|transition|duration|ease|scale|rotate|translate|overflow|object|from|via|to|backdrop|blur|brightness)-/;

const HEX_WORD_OK = new Set([
  "dead","face","cafe","beef","feed","fade","deed","bead","deaf","bade","aced",
]);

function isNoiseToken(w: string): boolean {
  if (w.startsWith("-") || w.endsWith("-")) return true;
  if (PHRASE_NOISE.has(w)) return true;
  if (TW_PREFIX.test(w)) return true;
  // single-letter BEM / daisy prefix: a-stage, a-check
  if (/^[a-z]-/.test(w)) return true;
  // hex / hash fragments
  if (/^[a-f0-9]+$/.test(w) && /\d/.test(w)) return true;
  if (w.length === 2 && /^[a-f]{2}$/.test(w) && w !== "be" && w !== "ad") {
    return true;
  }
  if (/^[a-f]{4}$/.test(w) && !HEX_WORD_OK.has(w)) return true;
  // short consonant soup (keep git/npm/...)
  if (
    w.length <= 3 &&
    !/[aeiouy]/.test(w) &&
    !SHORT_TECH_OK.has(w)
  ) {
    return true;
  }
  // opaque ids / base64-ish blobs (low vowel density)
  const vowels = (w.match(/[aeiouy]/g) || []).length;
  if (w.length >= 5 && vowels === 0) return true;
  if (w.length >= 5 && vowels / w.length < 0.3) return true;
  if (w.length >= 14 && !w.includes("-")) return true;
  // aria-/data-/stroke- style attributes
  if (/^(aria|data|stroke|btn|fill|view|xmlns|collapse|user|tcp)-/.test(w)) {
    return true;
  }
  // multi-hyphen tech identifiers (keep single-hyphen English like real-time)
  if ((w.match(/-/g) || []).length >= 2) return true;
  return false;
}

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
    w.length <= 30 &&
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
 * Sentence-bounded token sequences so n-grams never cross ".!?".
 * Short function words are kept so phrasal verbs / prep collocations survive.
 */
/**
 * Sentence-bounded token sequences so n-grams never cross ".!?".
 * Noise tokens become hard boundaries (not deleted) so we don't
 * invent fake collocations like "the is asking".
 */
function tokenizeSequences(text: string): string[][] {
  const cleaned = stripMarkdown(text).toLowerCase();
  const sequences: string[][] = [];

  for (const sentence of cleaned.split(/[.!?]+/)) {
    const raw = sentence.split(/[^a-z'-]+/).filter(isToken);
    let cur: string[] = [];
    const flush = () => {
      if (cur.length >= 2) sequences.push(cur);
      cur = [];
    };
    for (const t of raw) {
      if (isNoiseToken(t)) {
        flush();
      } else {
        cur.push(t);
      }
    }
    flush();
  }
  return sequences;
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
    if (t.length < 3) continue;
    if (STOP_WORDS.has(t)) continue;
    freq.set(t, (freq.get(t) || 0) + 1);
  }
  return Array.from(freq.entries())
    .map(([word, count]) => ({ word, count }))
    .sort((a, b) => b.count - a.count);
}

/** At least one content word; reject identical repeats / hex soup / weak det+noun. */
function phraseHasContent(words: string[]): boolean {
  if (new Set(words).size === 1) return false;
  if (words.every((w) => /^[a-f0-9]+$/.test(w))) return false;
  const first = words[0];
  const last = words[words.length - 1];
  // "the header" / "within the" / "to update the"
  if (
    first === "the" ||
    first === "a" ||
    first === "an" ||
    last === "the" ||
    last === "a" ||
    last === "an"
  ) {
    return false;
  }
  // "everything is"
  if (
    words.length === 2 &&
    (last === "is" || last === "are" || last === "was" || last === "were")
  ) {
    return false;
  }
  return words.some(
    (w) => !STOP_WORDS.has(w) && !PHRASE_NOISE.has(w) && w.length >= 3
  );
}

/**
 * Contiguous bigrams/trigrams scored by PMI.
 * Higher PMI = words co-occur more than by chance (real collocations).
 */
function extractPhrases(
  sequences: string[][],
  minCount = 3,
  minPmi = 2.5
): PhraseFreq[] {
  const unigram = new Map<string, number>();
  const bigram = new Map<string, number>();
  const trigram = new Map<string, number>();
  let N = 0;

  for (const toks of sequences) {
    for (const t of toks) {
      unigram.set(t, (unigram.get(t) || 0) + 1);
      N += 1;
    }
    for (let i = 0; i < toks.length - 1; i++) {
      const key = `${toks[i]} ${toks[i + 1]}`;
      bigram.set(key, (bigram.get(key) || 0) + 1);
    }
    for (let i = 0; i < toks.length - 2; i++) {
      const key = `${toks[i]} ${toks[i + 1]} ${toks[i + 2]}`;
      trigram.set(key, (trigram.get(key) || 0) + 1);
    }
  }

  if (N === 0) return [];

  type Scored = PhraseFreq & { score: number };
  const scored: Scored[] = [];

  for (const [phrase, count] of bigram) {
    if (count < minCount) continue;
    const parts = phrase.split(" ");
    if (!phraseHasContent(parts)) continue;
    const [a, b] = parts;
    const ca = unigram.get(a) || 0;
    const cb = unigram.get(b) || 0;
    if (ca === 0 || cb === 0) continue;
    // PMI = log2( P(ab) / (P(a)P(b)) ) = log2( N * c(ab) / (c(a)c(b)) )
    const pmi = Math.log2((N * count) / (ca * cb));
    if (pmi < minPmi) continue;
    // Rank by frequency among PMI-qualified collocations (not raw PMI —
    // rare opaque co-occurrences otherwise dominate the list).
    scored.push({ phrase, count, score: count * Math.log2(2 + pmi) });
  }

  for (const [phrase, count] of trigram) {
    if (count < minCount) continue;
    const parts = phrase.split(" ");
    if (!phraseHasContent(parts)) continue;
    const [a, b, c] = parts;
    const ca = unigram.get(a) || 0;
    const cb = unigram.get(b) || 0;
    const cc = unigram.get(c) || 0;
    if (ca === 0 || cb === 0 || cc === 0) continue;
    // Approx trigram PMI vs independent unigrams
    const pmi = Math.log2((N * N * count) / (ca * cb * cc));
    if (pmi < minPmi) continue;
    scored.push({ phrase, count, score: count * Math.log2(2 + pmi) });
  }

  return scored
    .sort((a, b) => b.score - a.score || b.count - a.count)
    .map(({ phrase, count }) => ({ phrase, count }));
}

// In-memory cache keyed by file mtime + filter params + limits
let cache: { key: string; data: VocabResult } | null = null;

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
  wordLimit?: number;
  phraseLimit?: number;
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
    "phrases-pmi-v11",
    stems.join("+"),
    sources.slice().sort().join(","),
    parts.join(","),
    opts?.from || "",
    opts?.to || "",
    opts?.model || "",
    String(opts?.wordLimit ?? ""),
    String(opts?.phraseLimit ?? ""),
  ].join(":");
}

export function getVocabStats(opts?: {
  from?: string;
  to?: string;
  model?: string;
  sources?: VocabSource[];
  wordLimit?: number;
  phraseLimit?: number;
}): VocabResult {
  const sources = normalizeVocabSources(opts?.sources);
  const key = getCacheKey({ ...opts, sources });
  if (cache && cache.key === key) return cache.data;

  const chunks = readTextChunks({ ...opts, sources });
  const allTokens: string[] = [];
  const sequences: string[][] = [];
  const bySource = emptyBySource();

  for (const chunk of chunks) {
    bySource[chunk.source] += 1;
    allTokens.push(...tokenize(chunk.text));
    sequences.push(...tokenizeSequences(chunk.text));
  }

  const words = countWords(allTokens).slice(0, opts?.wordLimit ?? 200);
  const phrases = extractPhrases(sequences).slice(
    0,
    opts?.phraseLimit ?? 200
  );

  const data: VocabResult = {
    words,
    phrases,
    totalTokens: allTokens.length,
    totalRecords: chunks.length,
    bySource,
    sources,
  };
  cache = { key, data };
  return data;
}
