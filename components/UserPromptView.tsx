"use client";

import { useMemo } from "react";
import { DomContextChip } from "@/components/DomContextChip";
import { MarkdownContent } from "@/components/MarkdownContent";
import {
  parseUserPromptWithDomContext,
  type DomContextBlock,
} from "@/lib/parse-dom-context";

const BLOCK_MARKDOWN_RE = /(^|\n)(#{1,6}\s|[-*+]\s|\d+\.\s|```|>\s)/;

export function UserPromptView({
  prompt,
  domContexts: domContextsProp,
  className = "",
}: {
  prompt: string;
  /** When set (e.g. from API), skip re-parsing DOM blocks from prompt text. */
  domContexts?: DomContextBlock[];
  className?: string;
}) {
  const { domContexts, body } = useMemo(() => {
    const parsed = parseUserPromptWithDomContext(prompt);
    if (domContextsProp && domContextsProp.length > 0) {
      return {
        domContexts: domContextsProp,
        // Prefer stripped body when prompt still embeds raw DOM picker blocks.
        body: parsed.domContexts.length > 0 ? parsed.body : prompt,
      };
    }
    return parsed;
  }, [prompt, domContextsProp]);

  const hasBody = body.trim().length > 0;
  const hasDom = domContexts.length > 0;

  if (!hasDom && !hasBody) {
    return <p className={`text-sm opacity-60 ${className}`}>（空）</p>;
  }

  if (!hasDom) {
    return (
      <MarkdownContent className={`whitespace-pre-wrap break-words text-sm ${className}`}>
        {body}
      </MarkdownContent>
    );
  }

  const bodyInline = hasBody && !BLOCK_MARKDOWN_RE.test(body);

  return (
    <div className={`text-sm leading-relaxed ${className}`}>
      <span className="inline">
        {domContexts.map((block, i) => (
          <DomContextChip
            key={`dom-${i}-${block.domPath.slice(0, 24)}`}
            block={block}
            className={i < domContexts.length - 1 || hasBody ? "mr-1.5" : ""}
          />
        ))}
        {hasBody && bodyInline ? (
          <MarkdownContent inline className="break-words">
            {body}
          </MarkdownContent>
        ) : null}
      </span>
      {hasBody && !bodyInline ? (
        <MarkdownContent className="mt-2 whitespace-pre-wrap break-words">
          {body}
        </MarkdownContent>
      ) : null}
    </div>
  );
}
