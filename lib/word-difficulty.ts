/**
 * Word difficulty lexicon (NGSL / CEFR-J / Zipf).
 *
 * Offline: data/word-difficulty.generated.json (`npm run dict:build:difficulty`)
 */
import fs from "fs";
import path from "path";
import { wordLookupCandidates } from "./word-dictionary";
import {
  type CefrLevel,
  type WordDifficulty,
  CEFR_ORDER,
} from "./word-difficulty-shared";

export type {
  CefrLevel,
  WordDifficulty,
  DifficultyProfile,
  DifficultyFilter,
} from "./word-difficulty-shared";

export {
  CEFR_LEVELS,
  CEFR_ORDER,
  CEFR_HIDE_PRESETS,
  NGSL_HIDE_PRESETS,
  ZIPF_HIDE_PRESETS,
  normalizeDifficultyFilter,
  isBasicWord,
} from "./word-difficulty-shared";

type GeneratedFile = {
  ngsl?: { ranks?: Record<string, number> };
  cefr?: { levels?: Record<string, string> };
  zipf?: { scores?: Record<string, number> };
};

let loaded = false;
let ngslRanks: Record<string, number> = {};
let cefrLevels: Record<string, CefrLevel> = {};
let zipfScores: Record<string, number> = {};

function isCefrLevel(v: string): v is CefrLevel {
  return v in CEFR_ORDER;
}

function load() {
  if (loaded) return;
  loaded = true;
  const filePath = path.join(
    process.cwd(),
    "data",
    "word-difficulty.generated.json"
  );
  try {
    const raw = fs.readFileSync(filePath, "utf8");
    const data = JSON.parse(raw) as GeneratedFile;
    ngslRanks = data.ngsl?.ranks ?? {};
    zipfScores = data.zipf?.scores ?? {};
    const levels: Record<string, CefrLevel> = {};
    for (const [w, lv] of Object.entries(data.cefr?.levels ?? {})) {
      const n = String(lv).toLowerCase();
      if (isCefrLevel(n)) levels[w] = n;
    }
    cefrLevels = levels;
  } catch {
    ngslRanks = {};
    cefrLevels = {};
    zipfScores = {};
  }
}

/** Lookup difficulty for a surface form (light lemma fallback). */
export function lookupDifficulty(word: string): WordDifficulty {
  load();
  const out: WordDifficulty = {};
  for (const key of wordLookupCandidates(word)) {
    if (out.ngslRank == null && ngslRanks[key] != null) {
      out.ngslRank = ngslRanks[key];
    }
    if (out.cefr == null && cefrLevels[key]) {
      out.cefr = cefrLevels[key];
    }
    if (out.zipf == null && zipfScores[key] != null) {
      out.zipf = zipfScores[key];
    }
    if (out.ngslRank != null && out.cefr != null && out.zipf != null) break;
  }
  return out;
}

export function difficultyReady(): boolean {
  load();
  return (
    Object.keys(ngslRanks).length > 0 ||
    Object.keys(cefrLevels).length > 0 ||
    Object.keys(zipfScores).length > 0
  );
}
