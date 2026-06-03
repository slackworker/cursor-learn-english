"use client";

import { useCallback, useEffect, useState } from "react";

export function useSpeechVoices(): SpeechSynthesisVoice[] {
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);

  const refresh = useCallback(() => {
    if (typeof window === "undefined" || !window.speechSynthesis) return;
    setVoices(window.speechSynthesis.getVoices());
  }, []);

  useEffect(() => {
    refresh();
    const synth = window.speechSynthesis;
    synth.addEventListener("voiceschanged", refresh);
    return () => synth.removeEventListener("voiceschanged", refresh);
  }, [refresh]);

  return voices;
}
