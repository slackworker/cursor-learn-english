"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  PASSED_PHRASES_KEY,
  PASSED_WORDS_KEY,
  appendPassed,
  clearLegacyStarredWords,
  loadPassedList,
  popPassed,
  removePassed,
  savePassedList,
  type VocabPassKind,
} from "@/lib/vocab-pass";

export function useVocabPass() {
  const [passedWords, setPassedWords] = useState<string[]>([]);
  const [passedPhrases, setPassedPhrases] = useState<string[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const wordsRef = useRef(passedWords);
  const phrasesRef = useRef(passedPhrases);
  wordsRef.current = passedWords;
  phrasesRef.current = passedPhrases;

  useEffect(() => {
    setPassedWords(loadPassedList(PASSED_WORDS_KEY));
    setPassedPhrases(loadPassedList(PASSED_PHRASES_KEY));
    clearLegacyStarredWords();
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    savePassedList(PASSED_WORDS_KEY, passedWords);
  }, [hydrated, passedWords]);

  useEffect(() => {
    if (!hydrated) return;
    savePassedList(PASSED_PHRASES_KEY, passedPhrases);
  }, [hydrated, passedPhrases]);

  const passedWordSet = useMemo(() => new Set(passedWords), [passedWords]);
  const passedPhraseSet = useMemo(() => new Set(passedPhrases), [passedPhrases]);

  const pass = useCallback((kind: VocabPassKind, item: string) => {
    if (kind === "words") {
      setPassedWords((prev) => appendPassed(prev, item));
    } else {
      setPassedPhrases((prev) => appendPassed(prev, item));
    }
  }, []);

  const unpass = useCallback((kind: VocabPassKind, item: string) => {
    if (kind === "words") {
      setPassedWords((prev) => removePassed(prev, item));
    } else {
      setPassedPhrases((prev) => removePassed(prev, item));
    }
  }, []);

  const undo = useCallback((kind: VocabPassKind): string | null => {
    const current = kind === "words" ? wordsRef.current : phrasesRef.current;
    const [next, undone] = popPassed(current);
    if (undone == null) return null;
    if (kind === "words") setPassedWords(next);
    else setPassedPhrases(next);
    return undone;
  }, []);

  const isPassed = useCallback(
    (kind: VocabPassKind, item: string) => {
      const t = item.trim().toLowerCase();
      return kind === "words" ? passedWordSet.has(t) : passedPhraseSet.has(t);
    },
    [passedWordSet, passedPhraseSet]
  );

  return {
    hydrated,
    passedWords,
    passedPhrases,
    passedWordSet,
    passedPhraseSet,
    pass,
    unpass,
    undo,
    isPassed,
  };
}
