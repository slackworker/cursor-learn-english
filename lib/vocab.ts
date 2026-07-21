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

function stripMarkdown(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`[^`]+`/g, " ")
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/[a-zA-Z_][a-zA-Z0-9_]*\/[a-zA-Z0-9_/.\-]+/g, " ") // file paths
    .replace(/\b[A-Z][a-z]+[A-Z]\w*/g, " ") // camelCase identifiers
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

function tokenize(text: string): string[] {
  const cleaned = stripMarkdown(text).toLowerCase();
  return cleaned
    .split(/[^a-z'-]+/)
    .filter((w) => w.length >= 3 && w.length <= 30)
    .filter((w) => /[a-z]/.test(w))
    .filter((w) => !/^\d+$/.test(w))
    .filter((w) => !w.startsWith("'") && !w.endsWith("'"));
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
    if (STOP_WORDS.has(t)) continue;
    freq.set(t, (freq.get(t) || 0) + 1);
  }
  return Array.from(freq.entries())
    .map(([word, count]) => ({ word, count }))
    .sort((a, b) => b.count - a.count);
}

function extractPhrases(tokens: string[], minCount = 2): PhraseFreq[] {
  const freq2 = new Map<string, number>();
  const freq3 = new Map<string, number>();

  const meaningful = tokens.filter((t) => !STOP_WORDS.has(t));

  for (let i = 0; i < meaningful.length - 1; i++) {
    const bigram = `${meaningful[i]} ${meaningful[i + 1]}`;
    freq2.set(bigram, (freq2.get(bigram) || 0) + 1);
  }
  for (let i = 0; i < meaningful.length - 2; i++) {
    const trigram = `${meaningful[i]} ${meaningful[i + 1]} ${meaningful[i + 2]}`;
    freq3.set(trigram, (freq3.get(trigram) || 0) + 1);
  }

  const result: PhraseFreq[] = [];
  for (const [phrase, count] of freq2) {
    if (count >= minCount) result.push({ phrase, count });
  }
  for (const [phrase, count] of freq3) {
    if (count >= minCount) result.push({ phrase, count });
  }
  return result.sort((a, b) => b.count - a.count);
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
  const bySource = emptyBySource();

  for (const chunk of chunks) {
    bySource[chunk.source] += 1;
    allTokens.push(...tokenize(chunk.text));
  }

  const words = countWords(allTokens).slice(0, opts?.wordLimit ?? 200);
  const phrases = extractPhrases(allTokens, 2).slice(
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
