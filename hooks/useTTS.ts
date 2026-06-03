"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { stripMarkdownForTTS } from "@/lib/tts";

export function useTTS() {
  const [speakingId, setSpeakingId] = useState<string | null>(null);
  const utterRef = useRef<SpeechSynthesisUtterance | null>(null);

  const stop = useCallback(() => {
    if (typeof window !== "undefined") {
      window.speechSynthesis.cancel();
    }
    setSpeakingId(null);
    utterRef.current = null;
  }, []);

  const speak = useCallback(
    (id: string, text: string) => {
      if (typeof window === "undefined" || !window.speechSynthesis) return;

      if (speakingId === id) {
        stop();
        return;
      }

      window.speechSynthesis.cancel();

      const plain = stripMarkdownForTTS(text);
      if (!plain) return;

      const utter = new SpeechSynthesisUtterance(plain);
      utter.lang = "en-US";
      utter.onend = () => setSpeakingId(null);
      utter.onerror = () => setSpeakingId(null);

      utterRef.current = utter;
      setSpeakingId(id);
      window.speechSynthesis.speak(utter);
    },
    [speakingId, stop]
  );

  useEffect(() => {
    return () => {
      if (typeof window !== "undefined") {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  return { speakingId, speak, stop };
}
