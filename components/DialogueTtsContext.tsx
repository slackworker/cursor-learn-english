"use client";

import { useTts } from "@/components/TtsProvider";
import { getTtsTooltipLabel } from "@/lib/tts-settings";
import { TtsPlayButton } from "@/components/TtsPlayButton";

export function DialogueTtsPlayButton({
  id,
  text,
  className,
  raw = false,
}: {
  id: string;
  text: string;
  className?: string;
  /** Skip markdown stripping (words / phrases / preview). */
  raw?: boolean;
}) {
  const { speakingId, speak, settings } = useTts();
  const plain = text.trim();
  if (!plain) return null;

  const label = getTtsTooltipLabel(settings.lang);

  return (
    <div className="tooltip tooltip-left" data-tip={label}>
      <TtsPlayButton
        playing={speakingId === id}
        onClick={() => speak(id, text, raw ? { raw: true } : undefined)}
        className={className}
        label={label}
      />
    </div>
  );
}
