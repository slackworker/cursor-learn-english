"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { applyTtsSettingsToUtterance, type TtsSettings } from "@/lib/tts-settings";
import { chunkTextForTTS, stripMarkdownForTTS } from "@/lib/tts";

export const TTS_PREVIEW_ID = "__tts_preview__";

/** Chrome can silently pause long SpeechSynthesis runs; nudge every ~12s. */
const CHROME_KEEPALIVE_MS = 12_000;

export function useTTS(settings: TtsSettings, voices: SpeechSynthesisVoice[]) {
  const [speakingId, setSpeakingId] = useState<string | null>(null);
  const [lastError, setLastError] = useState<string | null>(null);
  const speakingIdRef = useRef<string | null>(null);
  const utterRef = useRef<SpeechSynthesisUtterance | null>(null);
  const queueRef = useRef<string[]>([]);
  const activeIdRef = useRef<string | null>(null);
  const cancelledRef = useRef(false);
  const keepAliveRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const settingsRef = useRef(settings);
  const voicesRef = useRef(voices);

  settingsRef.current = settings;
  voicesRef.current = voices;

  const clearKeepAlive = useCallback(() => {
    if (keepAliveRef.current != null) {
      clearInterval(keepAliveRef.current);
      keepAliveRef.current = null;
    }
  }, []);

  const clearSpeaking = useCallback(() => {
    clearKeepAlive();
    speakingIdRef.current = null;
    setSpeakingId(null);
    utterRef.current = null;
    queueRef.current = [];
    activeIdRef.current = null;
  }, [clearKeepAlive]);

  const stop = useCallback(() => {
    cancelledRef.current = true;
    queueRef.current = [];
    activeIdRef.current = null;
    if (typeof window !== "undefined") {
      window.speechSynthesis.cancel();
    }
    clearSpeaking();
  }, [clearSpeaking]);

  const startKeepAlive = useCallback(() => {
    clearKeepAlive();
    if (typeof window === "undefined" || !window.speechSynthesis) return;
    keepAliveRef.current = setInterval(() => {
      const synth = window.speechSynthesis;
      if (!synth.speaking) return;
      // pause/resume keeps Chrome from freezing mid-utterance
      synth.pause();
      synth.resume();
    }, CHROME_KEEPALIVE_MS);
  }, [clearKeepAlive]);

  const speakNextChunk = useCallback(() => {
    if (typeof window === "undefined" || !window.speechSynthesis) return;
    if (cancelledRef.current) return;

    const next = queueRef.current.shift();
    const id = activeIdRef.current;
    if (!next || !id) {
      clearSpeaking();
      return;
    }

    const utter = new SpeechSynthesisUtterance(next);
    applyTtsSettingsToUtterance(utter, settingsRef.current, voicesRef.current);

    utter.onend = () => {
      if (cancelledRef.current || activeIdRef.current !== id) return;
      if (queueRef.current.length > 0) {
        speakNextChunk();
        return;
      }
      clearSpeaking();
    };

    utter.onerror = (event) => {
      if (cancelledRef.current || activeIdRef.current !== id) return;
      // "interrupted" / "canceled" are expected when switching or stopping
      const err = event.error;
      if (err && err !== "interrupted" && err !== "canceled") {
        setLastError(`朗读失败：${err}`);
      }
      clearSpeaking();
    };

    utterRef.current = utter;
    window.speechSynthesis.speak(utter);
  }, [clearSpeaking]);

  const speak = useCallback(
    (id: string, text: string, options?: { raw?: boolean }) => {
      if (typeof window === "undefined" || !window.speechSynthesis) return;

      if (speakingIdRef.current === id) {
        stop();
        return;
      }

      cancelledRef.current = true;
      window.speechSynthesis.cancel();
      clearKeepAlive();
      queueRef.current = [];
      utterRef.current = null;

      const plain = options?.raw ? text.trim() : stripMarkdownForTTS(text);
      if (!plain) return;

      const chunks = chunkTextForTTS(plain);
      if (chunks.length === 0) return;

      cancelledRef.current = false;
      setLastError(null);
      queueRef.current = chunks;
      activeIdRef.current = id;
      speakingIdRef.current = id;
      setSpeakingId(id);
      startKeepAlive();
      speakNextChunk();
    },
    [stop, clearKeepAlive, startKeepAlive, speakNextChunk]
  );

  useEffect(() => {
    return () => {
      cancelledRef.current = true;
      clearKeepAlive();
      if (typeof window !== "undefined") {
        window.speechSynthesis.cancel();
      }
    };
  }, [clearKeepAlive]);

  return { speakingId, speak, stop, lastError, clearError: () => setLastError(null) };
}
