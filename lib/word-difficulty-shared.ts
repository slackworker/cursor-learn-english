/**
 * Shared difficulty filter types/helpers (safe for client components).
 * Lexicon loading lives in word-difficulty.ts (server-only).
 */

export type CefrLevel = "a1" | "a2" | "b1" | "b2" | "c1" | "c2";

export type WordDifficulty = {
  ngslRank?: number;
  cefr?: CefrLevel;
  zipf?: number;
};

export type DifficultyProfile = "off" | "ngsl" | "cefr" | "zipf";

export const CEFR_LEVELS: CefrLevel[] = [
  "a1",
  "a2",
  "b1",
  "b2",
  "c1",
  "c2",
];

export const CEFR_ORDER: Record<CefrLevel, number> = {
  a1: 1,
  a2: 2,
  b1: 3,
  b2: 4,
  c1: 5,
  c2: 6,
};

/** Presets for “hide words at or below this CEFR”. */
export const CEFR_HIDE_PRESETS: CefrLevel[] = ["a1", "a2", "b1", "b2"];

/** Presets for “hide NGSL ranks ≤ N” (incl. all core lemmas). */
export const NGSL_HIDE_PRESETS = [500, 1000, 2000, 2809] as const;

/** Presets for “hide Zipf ≥ N” (higher = more common). */
export const ZIPF_HIDE_PRESETS = [5.5, 5.0, 4.5, 4.0] as const;

export type DifficultyFilter = {
  profile: DifficultyProfile;
  /** Hide NGSL when rank ≤ this (default 500 = top 500). */
  ngslMaxRank?: number;
  /** Hide CEFR when level ≤ this (default a2). */
  cefrMax?: CefrLevel;
  /** Hide Zipf when score ≥ this (default 5.0). */
  zipfMin?: number;
};

/** Default: hide NGSL top 500. Badge display still prefers CEFR. */
export const DEFAULT_DIFFICULTY_FILTER: DifficultyFilter = {
  profile: "ngsl",
  ngslMaxRank: 500,
};

function isCefrLevel(v: string): v is CefrLevel {
  return v in CEFR_ORDER;
}

export function normalizeDifficultyFilter(
  raw?: Partial<DifficultyFilter> | null
): DifficultyFilter {
  const profile = raw?.profile ?? DEFAULT_DIFFICULTY_FILTER.profile;
  if (profile !== "ngsl" && profile !== "cefr" && profile !== "zipf") {
    return { profile: "off" };
  }
  if (profile === "ngsl") {
    const n = Number(raw?.ngslMaxRank);
    const ngslMaxRank =
      Number.isFinite(n) && n > 0
        ? Math.floor(n)
        : (DEFAULT_DIFFICULTY_FILTER.ngslMaxRank ?? 500);
    return { profile, ngslMaxRank };
  }
  if (profile === "cefr") {
    const lv = String(raw?.cefrMax || "a2").toLowerCase();
    const cefrMax = isCefrLevel(lv) ? lv : "a2";
    return { profile, cefrMax };
  }
  const z = Number(raw?.zipfMin);
  const zipfMin = Number.isFinite(z) && z > 0 ? z : 5.0;
  return { profile, zipfMin };
}

/**
 * True when the word should be hidden as “too basic” for the filter.
 * Unknown / unannotated words are kept (often tech or rare).
 */
export function isBasicWord(
  diff: WordDifficulty,
  filter: DifficultyFilter
): boolean {
  if (filter.profile === "off") return false;
  if (filter.profile === "ngsl") {
    const max = filter.ngslMaxRank ?? DEFAULT_DIFFICULTY_FILTER.ngslMaxRank ?? 500;
    return diff.ngslRank != null && diff.ngslRank <= max;
  }
  if (filter.profile === "cefr") {
    const max = filter.cefrMax ?? "a2";
    if (!diff.cefr) return false;
    return CEFR_ORDER[diff.cefr] <= CEFR_ORDER[max];
  }
  const min = filter.zipfMin ?? 5.0;
  return diff.zipf != null && diff.zipf >= min;
}

export const DIFFICULTY_STORAGE_KEY = "vocab_difficulty_filter_v1";

export function loadDifficultyFilter(): DifficultyFilter {
  if (typeof window === "undefined") return { ...DEFAULT_DIFFICULTY_FILTER };
  try {
    const raw = localStorage.getItem(DIFFICULTY_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_DIFFICULTY_FILTER };
    return normalizeDifficultyFilter(JSON.parse(raw));
  } catch {
    return { ...DEFAULT_DIFFICULTY_FILTER };
  }
}

export function saveDifficultyFilter(filter: DifficultyFilter) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(
      DIFFICULTY_STORAGE_KEY,
      JSON.stringify(normalizeDifficultyFilter(filter))
    );
  } catch {
    /* ignore quota */
  }
}
