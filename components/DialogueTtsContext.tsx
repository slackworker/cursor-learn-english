"use client";

import { type ReactNode } from "react";
import { useTts } from "@/components/TtsProvider";
import { getTtsTooltipLabel } from "@/lib/tts-settings";
import { TtsPlayButton } from "@/components/TtsPlayButton";

/** @deprecated Layout-level TtsProvider is sufficient; kept for minimal diff at call sites. */
export function DialogueTtsProvider({ children }: { children: ReactNode }) {
  return <>{children}</>;
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
  const { speakingId, speak, settings } = useTts();
  const plain = text.trim();
  if (!plain) return null;

  return (
    <div className="tooltip tooltip-left" data-tip={getTtsTooltipLabel(settings.lang)}>
      <TtsPlayButton
        playing={speakingId === id}
        onClick={() => speak(id, text)}
        className={className}
      />
    </div>
  );
}
