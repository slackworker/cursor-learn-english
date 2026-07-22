/**
 * Passed vocab lists — items the learner already knows.
 * Server persists to data/vocab-passed.json; browser localStorage is only
 * used once to migrate older client-side data.
 */

export const PASSED_WORDS_KEY = "vocab_passed_words_v1";
export const PASSED_PHRASES_KEY = "vocab_passed_phrases_v1";
/** Legacy "starred 生词" key — cleared on first pass-list hydrate. */
export const LEGACY_STARRED_WORDS_KEY = "vocab_new_words_v1";

export type VocabPassKind = "words" | "phrases";

export type VocabPassState = {
  words: string[];
  phrases: string[];
  updatedAt: string | null;
};

export function storageKeyFor(kind: VocabPassKind): string {
  return kind === "words" ? PASSED_WORDS_KEY : PASSED_PHRASES_KEY;
}

/** Normalize + dedupe; preserves first-seen order. */
export function normalizePassedList(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    if (typeof item !== "string") continue;
    const t = item.trim().toLowerCase();
    if (!t || seen.has(t)) continue;
    seen.add(t);
    out.push(t);
  }
  return out;
}

export function loadPassedList(key: string): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return [];
    return normalizePassedList(JSON.parse(raw));
  } catch {
    return [];
  }
}

export function savePassedList(key: string, list: string[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(list));
  } catch {
    // quota / private mode — ignore
  }
}

/** Append if missing; preserves prior order, newest at end. */
export function appendPassed(list: string[], item: string): string[] {
  const t = item.trim().toLowerCase();
  if (!t || list.includes(t)) return list;
  return [...list, t];
}

/** Remove one item anywhere in the list (restore from passed view). */
export function removePassed(list: string[], item: string): string[] {
  const t = item.trim().toLowerCase();
  if (!t) return list;
  return list.filter((x) => x !== t);
}

/** Undo last pass — pop newest. Returns [nextList, undoneItem | null]. */
export function popPassed(list: string[]): [string[], string | null] {
  if (list.length === 0) return [list, null];
  const next = list.slice(0, -1);
  return [next, list[list.length - 1] ?? null];
}

/** Merge `extra` onto `base`, keeping base order and appending new items. */
export function mergePassedLists(base: string[], extra: string[]): string[] {
  let out = base;
  for (const item of normalizePassedList(extra)) {
    out = appendPassed(out, item);
  }
  return out;
}

export function clearLegacyStarredWords(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(LEGACY_STARRED_WORDS_KEY);
  } catch {
    // ignore
  }
}

/** Clear browser pass keys after a successful server migrate. */
export function clearBrowserPassedLists(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(PASSED_WORDS_KEY);
    window.localStorage.removeItem(PASSED_PHRASES_KEY);
  } catch {
    // ignore
  }
}
