"use client";

import {
  domContextChipLabel,
  domContextTooltip,
  type DomContextBlock,
} from "@/lib/parse-dom-context";

const CURSOR_DOM_TARGET_MASK = "url(/cursor-box-ref.png)";

/** Cursor DOM target silhouette (PNG mask → `currentColor`). */
function BrowserTargetIcon() {
  return (
    <span
      aria-hidden
      className="inline-block h-3 w-3.5 shrink-0 bg-current"
      style={{
        maskImage: CURSOR_DOM_TARGET_MASK,
        WebkitMaskImage: CURSOR_DOM_TARGET_MASK,
        maskSize: "100% 100%",
        WebkitMaskSize: "100% 100%",
        maskRepeat: "no-repeat",
        WebkitMaskRepeat: "no-repeat",
        maskPosition: "center",
        WebkitMaskPosition: "center",
      }}
    />
  );
}

export function DomContextChip({
  block,
  className = "",
}: {
  block: DomContextBlock;
  className?: string;
}) {
  const label = domContextChipLabel(block.htmlElement);
  const tooltip = domContextTooltip(block);

  return (
    <span
      className={`inline-flex max-w-full align-middle items-center gap-1 rounded-[5px] px-1.5 py-px font-mono text-[12px] leading-none [html[data-theme=corporate]_&]:border [html[data-theme=corporate]_&]:border-sky-200/80 [html[data-theme=corporate]_&]:bg-sky-50 [html[data-theme=corporate]_&]:text-sky-600 [html[data-theme=business]_&]:border-transparent [html[data-theme=business]_&]:bg-[#2d333b] [html[data-theme=business]_&]:text-sky-400 ${className}`}
      title={tooltip}
    >
      <BrowserTargetIcon />
      <span className="truncate">{label}</span>
    </span>
  );
}
