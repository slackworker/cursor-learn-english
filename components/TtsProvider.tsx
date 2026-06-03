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
import { createPortal } from "react-dom";
import { TTS_PREVIEW_ID, useTTS } from "@/hooks/useTTS";
import { useSpeechVoices } from "@/hooks/useSpeechVoices";
import { TtsSettingsDrawer } from "@/components/TtsSettingsDrawer";
import {
  DEFAULT_TTS_SETTINGS,
  getTtsPreviewText,
  loadTtsSettings,
  saveTtsSettings,
  voiceMatchesLang,
  type TtsSettings,
} from "@/lib/tts-settings";

type TtsContextValue = {
  settings: TtsSettings;
  updateSettings: (patch: Partial<TtsSettings>) => void;
  resetSettings: () => void;
  voices: SpeechSynthesisVoice[];
  voicesForLang: SpeechSynthesisVoice[];
  speakingId: string | null;
  speak: (id: string, text: string) => void;
  preview: () => void;
  drawerOpen: boolean;
  openDrawer: () => void;
  closeDrawer: () => void;
  speechSupported: boolean;
};

const TtsContext = createContext<TtsContextValue | null>(null);

export function TtsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<TtsSettings>(DEFAULT_TTS_SETTINGS);
  const [hydrated, setHydrated] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [speechSupported, setSpeechSupported] = useState(false);
  const voices = useSpeechVoices();
  const { speakingId, speak, stop } = useTTS(settings, voices);

  useEffect(() => {
    setMounted(true);
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

  const updateSettings = useCallback((patch: Partial<TtsSettings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      if (patch.lang !== undefined && patch.lang !== prev.lang) {
        const stillValid =
          !next.voiceURI || voices.some((v) => v.voiceURI === next.voiceURI && voiceMatchesLang(v, next.lang));
        if (!stillValid) next.voiceURI = "";
      }
      return next;
    });
  }, [voices]);

  const resetSettings = useCallback(() => {
    setSettings(DEFAULT_TTS_SETTINGS);
  }, []);

  const openDrawer = useCallback(() => setDrawerOpen(true), []);
  const closeDrawer = useCallback(() => setDrawerOpen(false), []);

  const preview = useCallback(() => {
    speak(TTS_PREVIEW_ID, getTtsPreviewText(settings.lang), { raw: true });
  }, [speak, settings.lang]);

  useEffect(() => {
    if (!drawerOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeDrawer();
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [drawerOpen, closeDrawer]);

  const value: TtsContextValue = {
    settings,
    updateSettings,
    resetSettings,
    voices,
    voicesForLang,
    speakingId,
    speak: (id, text) => speak(id, text),
    preview,
    drawerOpen,
    openDrawer,
    closeDrawer,
    speechSupported,
  };

  const drawer =
    mounted &&
    createPortal(
      <TtsSettingsDrawer
        open={drawerOpen}
        onClose={closeDrawer}
        settings={settings}
        onChange={updateSettings}
        onReset={resetSettings}
        voicesForLang={voicesForLang}
        allVoicesCount={voices.length}
        speechSupported={speechSupported}
        previewPlaying={speakingId === TTS_PREVIEW_ID}
        onPreview={preview}
        onPreviewStop={stop}
      />,
      document.body
    );

  return (
    <TtsContext.Provider value={value}>
      {children}
      {drawer}
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
