"use client";

import { createContext, useContext, type ReactNode } from "react";
import { useTTS } from "@/hooks/useTTS";
import { TtsPlayButton } from "@/components/TtsPlayButton";

type DialogueTtsContextValue = {
  speakingId: string | null;
  speak: (id: string, text: string) => void;
};

const DialogueTtsContext = createContext<DialogueTtsContextValue | null>(null);

export function DialogueTtsProvider({ children }: { children: ReactNode }) {
  const { speakingId, speak } = useTTS();
  return (
    <DialogueTtsContext.Provider value={{ speakingId, speak }}>
      {children}
    </DialogueTtsContext.Provider>
  );
}

function useDialogueTts() {
  const ctx = useContext(DialogueTtsContext);
  if (!ctx) {
    throw new Error("DialogueTtsPlayButton must be used within DialogueTtsProvider");
  }
  return ctx;
}

export function DialogueTtsPlayButton({
  id,
  text,
  className,
}: {
  id: string;
  text: string;
  className?: string;
}) {
  const { speakingId, speak } = useDialogueTts();
  const plain = text.trim();
  if (!plain) return null;

  return (
    <div className="tooltip tooltip-left" data-tip="朗读英语">
      <TtsPlayButton
        playing={speakingId === id}
        onClick={() => speak(id, text)}
        className={className}
      />
    </div>
  );
}
