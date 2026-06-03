"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { applyTtsSettingsToUtterance, type TtsSettings } from "@/lib/tts-settings";
import { stripMarkdownForTTS } from "@/lib/tts";

export const TTS_PREVIEW_ID = "__tts_preview__";

export function useTTS(settings: TtsSettings, voices: SpeechSynthesisVoice[]) {
  const [speakingId, setSpeakingId] = useState<string | null>(null);
  const utterRef = useRef<SpeechSynthesisUtterance | null>(null);
  const settingsRef = useRef(settings);
  const voicesRef = useRef(voices);

  settingsRef.current = settings;
  voicesRef.current = voices;

  const stop = useCallback(() => {
    if (typeof window !== "undefined") {
      window.speechSynthesis.cancel();
    }
    setSpeakingId(null);
    utterRef.current = null;
  }, []);

  const speak = useCallback(
    (id: string, text: string, options?: { raw?: boolean }) => {
      if (typeof window === "undefined" || !window.speechSynthesis) return;

      if (speakingId === id) {
        stop();
        return;
      }

      window.speechSynthesis.cancel();

      const plain = options?.raw ? text.trim() : stripMarkdownForTTS(text);
      if (!plain) return;

      const utter = new SpeechSynthesisUtterance(plain);
      applyTtsSettingsToUtterance(utter, settingsRef.current, voicesRef.current);
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
