"use client";

import {
  domContextChipLabel,
  domContextTooltip,
  type DomContextBlock,
} from "@/lib/parse-dom-context";

/** Cursor-style browser target: hollow window + cyan pointer at bottom-right. */
function BrowserTargetIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 16 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
      className="shrink-0"
    >
      <rect
        x="2"
        y="2.5"
        width="8"
        height="6.5"
        rx="1"
        stroke="#8b949e"
        strokeWidth="1.15"
      />
      <path
        fill="#38bdf8"
        d="M8.15 7.65v5.05h1.05l1.28-1.62 1.98 2.82.95-.67-1.98-2.82 1.92-.72H8.15Z"
      />
    </svg>
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
      className={`inline-flex max-w-full align-middle items-center gap-1 rounded-[5px] bg-[#2d333b] px-1.5 py-px font-mono text-[12px] leading-none text-sky-400 ${className}`}
      title={tooltip}
    >
      <BrowserTargetIcon />
      <span className="truncate">{label}</span>
    </span>
  );
}
