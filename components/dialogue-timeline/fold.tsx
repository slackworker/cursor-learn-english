"use client";

import type { ReactNode } from "react";
import { DialogueTtsPlayButton } from "@/components/DialogueTtsContext";
import { MarkdownContent } from "@/components/MarkdownContent";
import type { DialogueTimelineBlock } from "@/lib/dialogue-timeline";
import { thoughtFoldLabel } from "@/lib/process-activity";
import "../process-fold.css";

/** Flat Cursor-like fold chrome — no nested card padding/indent. */
export const PROCESS_FOLD_CLASS =
  "process-fold collapse !rounded-none !border-0 !bg-transparent";
export const PROCESS_FOLD_TITLE_CLASS =
  "collapse-title process-fold-title !min-h-0 !w-fit !max-w-full !py-1.5 !px-0 !pe-0 text-xs font-medium";
export const PROCESS_FOLD_CONTENT_CLASS = "collapse-content !px-0 !pb-1.5 !pt-1";

/** Right gutter for TTS — centers the control on the first text line. */
export const TTS_CONTROL_CLASS =
  "flex h-[1lh] w-8 shrink-0 items-center justify-center self-start";

function FoldChevron() {
  return (
    <span className="process-fold-chevron" aria-hidden>
      {/* Collapsed: › — shown on summary hover only (see globals.css) */}
      <svg
        className="process-fold-chevron-icon process-fold-chevron-closed"
        viewBox="0 0 16 16"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M6 3.5 10.5 8 6 12.5" />
      </svg>
      {/* Expanded: ∨ — always visible while this details is open */}
      <svg
        className="process-fold-chevron-icon process-fold-chevron-open"
        viewBox="0 0 16 16"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M3.5 6 8 10.5 12.5 6" />
      </svg>
    </span>
  );
}

export function ProcessFoldSummary({ children }: { children: ReactNode }) {
  return (
    <summary className={PROCESS_FOLD_TITLE_CLASS}>
      <span className="process-fold-label">{children}</span>
      <FoldChevron />
    </summary>
  );
}

export function TextWithTts({
  id,
  text,
  className = "",
}: {
  id: string;
  text: string;
  className?: string;
}) {
  return (
    <div className="flex items-start gap-0 text-base leading-relaxed">
      <MarkdownContent
        className={`min-w-0 flex-1 break-words ${className}`.trim()}
      >
        {text}
      </MarkdownContent>
      <div className={TTS_CONTROL_CLASS}>
        <DialogueTtsPlayButton id={id} text={text} />
      </div>
    </div>
  );
}

export function ProcessFold({
  summary,
  children,
}: {
  summary: string;
  children: ReactNode;
}) {
  return (
    <details className={PROCESS_FOLD_CLASS}>
      <ProcessFoldSummary>{summary}</ProcessFoldSummary>
      <div className={`${PROCESS_FOLD_CONTENT_CLASS} space-y-1`}>{children}</div>
    </details>
  );
}

export function ThinkingBlock({
  block,
  blockKey,
}: {
  block: Extract<DialogueTimelineBlock, { kind: "thinking" }>;
  blockKey: string;
}) {
  return (
    <details key={blockKey} className={PROCESS_FOLD_CLASS}>
      <ProcessFoldSummary>{thoughtFoldLabel(block.data)}</ProcessFoldSummary>
      <div className={PROCESS_FOLD_CONTENT_CLASS}>
        <TextWithTts id={`${blockKey}-tts`} text={block.data.text} />
      </div>
    </details>
  );
}
