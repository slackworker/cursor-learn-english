"use client";

import { useMemo } from "react";
import { DomContextChip } from "@/components/DomContextChip";
import {
  parseUserPromptWithDomContext,
  segmentsFromDomAndBody,
  type DomContextBlock,
  type PromptSegment,
} from "@/lib/parse-dom-context";

export function SessionTitleView({
  title,
  segments: segmentsProp,
  domContexts: domContextsProp,
  body: bodyProp,
  fallback,
  variant = "inline",
  className = "",
}: {
  title?: string;
  segments?: PromptSegment[];
  domContexts?: DomContextBlock[];
  body?: string;
  fallback?: string;
  /** inline truncates; wrap shows the full short title; heading allows 2 lines. */
  variant?: "heading" | "inline" | "wrap";
  className?: string;
}) {
  const { segments, useFallback } = useMemo(() => {
    if (segmentsProp && segmentsProp.length > 0) {
      return { segments: segmentsProp, useFallback: false };
    }
    if (domContextsProp && domContextsProp.length > 0) {
      return {
        segments: segmentsFromDomAndBody(domContextsProp, bodyProp ?? ""),
        useFallback: false,
      };
    }
    const raw = title?.trim();
    if (!raw) {
      return { segments: [] as PromptSegment[], useFallback: Boolean(fallback) };
    }
    const parsed = parseUserPromptWithDomContext(raw);
    if (parsed.segments.length > 0) {
      return { segments: parsed.segments, useFallback: false };
    }
    return {
      segments: [{ type: "text" as const, text: raw }],
      useFallback: false,
    };
  }, [title, segmentsProp, domContextsProp, bodyProp, fallback]);

  if (useFallback && fallback) {
    return <span className={className}>{fallback}</span>;
  }

  const hasContent = segments.some(
    (s) => s.type === "dom" || (s.type === "text" && s.text.trim().length > 0)
  );

  if (!hasContent) {
    return fallback ? <span className={className}>{fallback}</span> : null;
  }

  const chipClass = variant === "heading" ? "mr-1.5" : "shrink-0";

  if (variant === "heading") {
    return (
      <span
        className={`block max-w-full leading-relaxed line-clamp-2 ${className}`}
      >
        {segments.map((seg, i) =>
          seg.type === "dom" ? (
            <DomContextChip
              key={`title-dom-${i}-${seg.block.domPath.slice(0, 24)}`}
              block={seg.block}
              className={chipClass}
            />
          ) : (
            <span key={`title-text-${i}`}>{seg.text}</span>
          )
        )}
      </span>
    );
  }

  if (variant === "wrap") {
    return (
      <span className={`inline break-words ${className}`}>
        {segments.map((seg, i) =>
          seg.type === "dom" ? (
            <DomContextChip
              key={`title-dom-${i}-${seg.block.domPath.slice(0, 24)}`}
              block={seg.block}
              className={`${chipClass} mr-1 align-baseline`}
            />
          ) : (
            <span key={`title-text-${i}`}>{seg.text}</span>
          )
        )}
      </span>
    );
  }

  return (
    <span
      className={`flex min-w-0 items-center gap-1.5 overflow-hidden ${className}`}
    >
      {segments.map((seg, i) => {
        if (seg.type === "dom") {
          return (
            <DomContextChip
              key={`title-dom-${i}-${seg.block.domPath.slice(0, 24)}`}
              block={seg.block}
              className={chipClass}
            />
          );
        }
        const hasLaterText = segments
          .slice(i + 1)
          .some((s) => s.type === "text" && s.text.trim().length > 0);
        return (
          <span
            key={`title-text-${i}`}
            className={
              hasLaterText ? "shrink-0" : "min-w-0 flex-1 truncate"
            }
          >
            {seg.text}
          </span>
        );
      })}
    </span>
  );
}
