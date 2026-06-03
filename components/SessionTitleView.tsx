"use client";

import { useMemo } from "react";
import { DomContextChip } from "@/components/DomContextChip";
import {
  parseUserPromptWithDomContext,
  type DomContextBlock,
} from "@/lib/parse-dom-context";

export function SessionTitleView({
  title,
  domContexts: domContextsProp,
  body: bodyProp,
  fallback,
  variant = "inline",
  className = "",
}: {
  title?: string;
  domContexts?: DomContextBlock[];
  body?: string;
  fallback?: string;
  variant?: "heading" | "inline";
  className?: string;
}) {
  const { domContexts, body, useFallback } = useMemo(() => {
    if (domContextsProp && domContextsProp.length > 0) {
      return {
        domContexts: domContextsProp,
        body: bodyProp ?? "",
        useFallback: false,
      };
    }
    const raw = title?.trim();
    if (!raw) {
      return { domContexts: [], body: "", useFallback: Boolean(fallback) };
    }
    const parsed = parseUserPromptWithDomContext(raw);
    if (parsed.domContexts.length > 0) {
      return { domContexts: parsed.domContexts, body: parsed.body, useFallback: false };
    }
    return { domContexts: [], body: raw, useFallback: false };
  }, [title, domContextsProp, bodyProp, fallback]);

  if (useFallback && fallback) {
    return <span className={className}>{fallback}</span>;
  }

  const hasBody = body.trim().length > 0;
  const hasDom = domContexts.length > 0;

  if (!hasDom && !hasBody) {
    return fallback ? <span className={className}>{fallback}</span> : null;
  }

  const textClass =
    variant === "heading" ? "text-2xl font-semibold" : "truncate text-inherit";

  if (!hasDom) {
    return <span className={`${textClass} ${className}`}>{body}</span>;
  }

  const chipSpacing = variant === "heading" ? "mr-2" : "mr-1.5";

  return (
    <span
      className={`inline max-w-full align-middle leading-relaxed ${textClass} ${className}`}
    >
      {domContexts.map((block, i) => (
        <DomContextChip
          key={`title-dom-${i}-${block.domPath.slice(0, 24)}`}
          block={block}
          className={
            i < domContexts.length - 1 || hasBody ? chipSpacing : undefined
          }
        />
      ))}
      {hasBody ? <span className={variant === "inline" ? "truncate" : ""}>{body}</span> : null}
    </span>
  );
}
