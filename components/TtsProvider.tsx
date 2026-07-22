"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { TTS_PREVIEW_ID, useTTS } from "@/hooks/useTTS";
import { useSpeechVoices } from "@/hooks/useSpeechVoices";
import {
  DEFAULT_TTS_SETTINGS,
  getTtsPreviewText,
  loadTtsSettings,
  saveTtsSettings,
  voiceMatchesLang,
  type TtsSettings,
} from "@/lib/tts-settings";

export { TTS_PREVIEW_ID };

type TtsContextValue = {
  settings: TtsSettings;
  updateSettings: (patch: Partial<TtsSettings>) => void;
  resetSettings: () => void;
  voices: SpeechSynthesisVoice[];
  voicesForLang: SpeechSynthesisVoice[];
  speakingId: string | null;
  speak: (id: string, text: string, options?: { raw?: boolean }) => void;
  stop: () => void;
  preview: () => void;
  speechSupported: boolean;
  lastError: string | null;
  clearError: () => void;
};

const TtsContext = createContext<TtsContextValue | null>(null);

export function TtsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<TtsSettings>(DEFAULT_TTS_SETTINGS);
  const [hydrated, setHydrated] = useState(false);
  const [speechSupported, setSpeechSupported] = useState(false);
  const voices = useSpeechVoices();
  const { speakingId, speak, stop, lastError, clearError } = useTTS(
    settings,
    voices
  );

  useEffect(() => {
    setSpeechSupported(typeof window.speechSynthesis !== "undefined");
    setSettings(loadTtsSettings());
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    saveTtsSettings(settings);
  }, [settings, hydrated]);

  const voicesForLang = useMemo(
    () => voices.filter((v) => voiceMatchesLang(v, settings.lang)),
    [voices, settings.lang]
  );

  const updateSettings = useCallback(
    (patch: Partial<TtsSettings>) => {
      setSettings((prev) => {
        const next = { ...prev, ...patch };
        if (patch.lang !== undefined && patch.lang !== prev.lang) {
          const stillValid =
            !next.voiceURI ||
            voices.some(
              (v) =>
                v.voiceURI === next.voiceURI && voiceMatchesLang(v, next.lang)
            );
          if (!stillValid) next.voiceURI = "";
        }
        return next;
      });
    },
    [voices]
  );

  const resetSettings = useCallback(() => {
    setSettings(DEFAULT_TTS_SETTINGS);
  }, []);

  const preview = useCallback(() => {
    speak(TTS_PREVIEW_ID, getTtsPreviewText(settings.lang), { raw: true });
  }, [speak, settings.lang]);

  const value: TtsContextValue = {
    settings,
    updateSettings,
    resetSettings,
    voices,
    voicesForLang,
    speakingId,
    speak,
    stop,
    preview,
    speechSupported,
    lastError,
    clearError,
  };

  return (
    <TtsContext.Provider value={value}>
      {children}
      <div className="sr-only" role="status" aria-live="polite">
        {lastError ?? ""}
      </div>
    </TtsContext.Provider>
  );
}

export function useTts(): TtsContextValue {
  const ctx = useContext(TtsContext);
  if (!ctx) {
    throw new Error("useTts must be used within TtsProvider");
  }
  return ctx;
}
