"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  PASSED_PHRASES_KEY,
  PASSED_WORDS_KEY,
  appendPassed,
  clearBrowserPassedLists,
  clearLegacyStarredWords,
  loadPassedList,
  popPassed,
  removePassed,
  type VocabPassKind,
  type VocabPassState,
} from "@/lib/vocab-pass";

type PassMutationResponse = VocabPassState & { undone?: string | null };

async function fetchPassState(): Promise<VocabPassState> {
  const res = await fetch("/api/vocab/pass", { cache: "no-store" });
  if (!res.ok) throw new Error(`Failed to load passed vocab: ${res.status}`);
  return res.json() as Promise<VocabPassState>;
}

async function postPassAction(
  body: Record<string, unknown>
): Promise<PassMutationResponse> {
  const res = await fetch("/api/vocab/pass", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Passed vocab update failed: ${res.status}`);
  return res.json() as Promise<PassMutationResponse>;
}

export function useVocabPass() {
  const [passedWords, setPassedWords] = useState<string[]>([]);
  const [passedPhrases, setPassedPhrases] = useState<string[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const wordsRef = useRef(passedWords);
  const phrasesRef = useRef(passedPhrases);
  wordsRef.current = passedWords;
  phrasesRef.current = passedPhrases;

  const queueRef = useRef(Promise.resolve());
  const applyState = useCallback((state: VocabPassState) => {
    setPassedWords(state.words);
    setPassedPhrases(state.phrases);
  }, []);

  const enqueue = useCallback((task: () => Promise<void>) => {
    queueRef.current = queueRef.current.then(task).catch(() => {
      // keep queue alive after a failed mutation
    });
    return queueRef.current;
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function hydrate() {
      clearLegacyStarredWords();
      const localWords = loadPassedList(PASSED_WORDS_KEY);
      const localPhrases = loadPassedList(PASSED_PHRASES_KEY);

      try {
        let state = await fetchPassState();
        if (
          localWords.length > 0 ||
          localPhrases.length > 0
        ) {
          state = await postPassAction({
            action: "migrate",
            words: localWords,
            phrases: localPhrases,
          });
          clearBrowserPassedLists();
        }
        if (!cancelled) {
          applyState(state);
          setHydrated(true);
        }
      } catch {
        // Server unreachable: fall back to local lists so the page still works offline briefly.
        if (!cancelled) {
          setPassedWords(localWords);
          setPassedPhrases(localPhrases);
          setHydrated(true);
        }
      }
    }

    void hydrate();
    return () => {
      cancelled = true;
    };
  }, [applyState]);

  // LAN multi-device: refresh when this tab becomes visible again.
  useEffect(() => {
    if (!hydrated) return;

    const refresh = () => {
      void enqueue(async () => {
        try {
          const state = await fetchPassState();
          applyState(state);
        } catch {
          // ignore transient network errors
        }
      });
    };

    const onVisibility = () => {
      if (document.visibilityState === "visible") refresh();
    };

    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [hydrated, enqueue, applyState]);

  const pass = useCallback(
    (kind: VocabPassKind, item: string) => {
      if (kind === "words") {
        setPassedWords((prev) => appendPassed(prev, item));
      } else {
        setPassedPhrases((prev) => appendPassed(prev, item));
      }

      void enqueue(async () => {
        try {
          const state = await postPassAction({ action: "pass", kind, item });
          applyState(state);
        } catch {
          // Re-sync from server if possible; otherwise leave optimistic state.
          try {
            applyState(await fetchPassState());
          } catch {
            // keep optimistic
          }
        }
      });
    },
    [enqueue, applyState]
  );

  const unpass = useCallback(
    (kind: VocabPassKind, item: string) => {
      if (kind === "words") {
        setPassedWords((prev) => removePassed(prev, item));
      } else {
        setPassedPhrases((prev) => removePassed(prev, item));
      }

      void enqueue(async () => {
        try {
          const state = await postPassAction({ action: "unpass", kind, item });
          applyState(state);
        } catch {
          try {
            applyState(await fetchPassState());
          } catch {
            // keep optimistic
          }
        }
      });
    },
    [enqueue, applyState]
  );

  const undo = useCallback(
    (kind: VocabPassKind): string | null => {
      const current = kind === "words" ? wordsRef.current : phrasesRef.current;
      const [next, undone] = popPassed(current);
      if (undone == null) return null;

      if (kind === "words") setPassedWords(next);
      else setPassedPhrases(next);

      void enqueue(async () => {
        try {
          const state = await postPassAction({ action: "undo", kind });
          applyState(state);
        } catch {
          try {
            applyState(await fetchPassState());
          } catch {
            // keep optimistic
          }
        }
      });

      return undone;
    },
    [enqueue, applyState]
  );

  const passedWordSet = useMemo(() => new Set(passedWords), [passedWords]);
  const passedPhraseSet = useMemo(() => new Set(passedPhrases), [passedPhrases]);

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
