/**
 * Server-side persistence for passed vocab lists.
 * File: data/vocab-passed.json (under getDataDir()).
 */

import fs from "fs";
import path from "path";
import { defaultVocabPassedPath } from "@/lib/default-paths";
import {
  appendPassed,
  mergePassedLists,
  normalizePassedList,
  popPassed,
  removePassed,
  type VocabPassKind,
  type VocabPassState,
} from "@/lib/vocab-pass";

type StoredFile = {
  words: string[];
  phrases: string[];
  updatedAt: string;
};

function emptyState(): VocabPassState {
  return { words: [], phrases: [], updatedAt: null };
}

function toState(data: StoredFile): VocabPassState {
  return {
    words: normalizePassedList(data.words),
    phrases: normalizePassedList(data.phrases),
    updatedAt: typeof data.updatedAt === "string" ? data.updatedAt : null,
  };
}

export function getVocabPassedPath(): string {
  return defaultVocabPassedPath();
}

export function readVocabPassed(): VocabPassState {
  const filePath = getVocabPassedPath();
  try {
    if (!fs.existsSync(filePath)) return emptyState();
    const raw = fs.readFileSync(filePath, "utf8");
    const parsed = JSON.parse(raw) as Partial<StoredFile>;
    return toState({
      words: Array.isArray(parsed.words) ? parsed.words : [],
      phrases: Array.isArray(parsed.phrases) ? parsed.phrases : [],
      updatedAt:
        typeof parsed.updatedAt === "string"
          ? parsed.updatedAt
          : new Date().toISOString(),
    });
  } catch {
    return emptyState();
  }
}

function writeVocabPassed(state: {
  words: string[];
  phrases: string[];
}): VocabPassState {
  const filePath = getVocabPassedPath();
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });

  const stored: StoredFile = {
    words: normalizePassedList(state.words),
    phrases: normalizePassedList(state.phrases),
    updatedAt: new Date().toISOString(),
  };

  const tmp = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(stored, null, 2)}\n`, "utf8");
  fs.renameSync(tmp, filePath);
  return toState(stored);
}

export function passVocabItem(
  kind: VocabPassKind,
  item: string
): VocabPassState {
  const current = readVocabPassed();
  if (kind === "words") {
    return writeVocabPassed({
      words: appendPassed(current.words, item),
      phrases: current.phrases,
    });
  }
  return writeVocabPassed({
    words: current.words,
    phrases: appendPassed(current.phrases, item),
  });
}

export function unpassVocabItem(
  kind: VocabPassKind,
  item: string
): VocabPassState {
  const current = readVocabPassed();
  if (kind === "words") {
    return writeVocabPassed({
      words: removePassed(current.words, item),
      phrases: current.phrases,
    });
  }
  return writeVocabPassed({
    words: current.words,
    phrases: removePassed(current.phrases, item),
  });
}

export function undoVocabPass(kind: VocabPassKind): {
  state: VocabPassState;
  undone: string | null;
} {
  const current = readVocabPassed();
  if (kind === "words") {
    const [words, undone] = popPassed(current.words);
    if (undone == null) return { state: current, undone: null };
    return {
      state: writeVocabPassed({ words, phrases: current.phrases }),
      undone,
    };
  }
  const [phrases, undone] = popPassed(current.phrases);
  if (undone == null) return { state: current, undone: null };
  return {
    state: writeVocabPassed({ words: current.words, phrases }),
    undone,
  };
}

/** Merge browser-local lists into the server file (idempotent). */
export function migrateVocabPassed(
  words: string[],
  phrases: string[]
): VocabPassState {
  const current = readVocabPassed();
  const nextWords = mergePassedLists(current.words, words);
  const nextPhrases = mergePassedLists(current.phrases, phrases);
  if (
    nextWords.length === current.words.length &&
    nextPhrases.length === current.phrases.length &&
    nextWords.every((w, i) => w === current.words[i]) &&
    nextPhrases.every((p, i) => p === current.phrases[i])
  ) {
    return current;
  }
  return writeVocabPassed({ words: nextWords, phrases: nextPhrases });
}
