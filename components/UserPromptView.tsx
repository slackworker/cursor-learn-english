"use client";

import { useMemo } from "react";
import { DialogueTtsPlayButton } from "@/components/DialogueTtsContext";
import { DomContextChip } from "@/components/DomContextChip";
import { MarkdownContent } from "@/components/MarkdownContent";
import {
  parseUserPromptWithDomContext,
  segmentsFromDomAndBody,
  type DomContextBlock,
  type PromptSegment,
} from "@/lib/parse-dom-context";

const BLOCK_MARKDOWN_RE = /(^|\n)(#{1,6}\s|[-*+]\s|\d+\.\s|```|>\s)/;

/** Right gutter for TTS — centers the control on the first text line. */
const TTS_CONTROL_CLASS =
  "flex h-[1lh] w-8 shrink-0 items-center justify-center self-start";

function textFromSegments(segments: PromptSegment[]): string {
  return segments
    .filter((s): s is Extract<PromptSegment, { type: "text" }> => s.type === "text")
    .map((s) => s.text)
    .join("\n\n")
    .trim();
}

export function UserPromptView({
  prompt,
  segments: segmentsProp,
  domContexts: domContextsProp,
  className = "",
  ttsId,
}: {
  prompt: string;
  /** Ordered text ↔ DOM segments (preferred over separate chips + body). */
  segments?: PromptSegment[];
  /** When set (e.g. from API), used when prompt has no embedded DOM blocks. */
  domContexts?: DomContextBlock[];
  className?: string;
  /** When set, show a play button for speakable text segments. */
  ttsId?: string;
}) {
  const segments = useMemo(() => {
    if (segmentsProp && segmentsProp.length > 0) return segmentsProp;

    const parsed = parseUserPromptWithDomContext(prompt);
    if (parsed.segments.some((s) => s.type === "dom")) {
      return parsed.segments;
    }
    if (domContextsProp && domContextsProp.length > 0) {
      return segmentsFromDomAndBody(domContextsProp, prompt);
    }
    return parsed.segments.length > 0
      ? parsed.segments
      : [{ type: "text" as const, text: prompt }];
  }, [prompt, segmentsProp, domContextsProp]);

  const body = textFromSegments(segments);
  const hasBody = body.length > 0;
  const hasDom = segments.some((s) => s.type === "dom");

  if (!hasDom && !hasBody) {
    return <p className={`text-sm opacity-60 ${className}`}>（空）</p>;
  }

  const content = (() => {
    if (!hasDom) {
      return (
        <MarkdownContent className={`whitespace-pre-wrap break-words text-base ${className}`}>
          {body}
        </MarkdownContent>
      );
    }

    const bodyInline = hasBody && !BLOCK_MARKDOWN_RE.test(body);

    if (bodyInline) {
      return (
        <div className={`text-base leading-relaxed ${className}`}>
          <span className="inline">
            {segments.map((seg, i) =>
              seg.type === "dom" ? (
                <DomContextChip
                  key={`dom-${i}-${seg.block.domPath.slice(0, 24)}`}
                  block={seg.block}
                  className="mr-1.5"
                />
              ) : seg.text.trim() ? (
                <MarkdownContent key={`text-${i}`} inline className="break-words">
                  {seg.text}
                </MarkdownContent>
              ) : null
            )}
          </span>
        </div>
      );
    }

    return (
      <div className={`text-base leading-relaxed ${className}`}>
        {segments.map((seg, i) =>
          seg.type === "dom" ? (
            <DomContextChip
              key={`dom-${i}-${seg.block.domPath.slice(0, 24)}`}
              block={seg.block}
              className="mr-1.5"
            />
          ) : seg.text.trim() ? (
            <MarkdownContent
              key={`block-text-${i}`}
              className="mt-2 whitespace-pre-wrap break-words first:mt-0"
            >
              {seg.text}
            </MarkdownContent>
          ) : null
        )}
      </div>
    );
  })();

  if (!ttsId || !hasBody) return content;

  return (
    <div className="flex items-start gap-0">
      <div className="min-w-0 flex-1">{content}</div>
      <div className={TTS_CONTROL_CLASS}>
        <DialogueTtsPlayButton id={ttsId} text={body} />
      </div>
    </div>
  );
}
