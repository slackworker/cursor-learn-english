"use client";

import { useEffect, useState } from "react";
import {
  applyFontSize,
  DEFAULT_FONT_SIZE,
  FONT_SIZE_LABELS,
  FONT_SIZE_SCALES,
  isFontSizeScale,
  type FontSizeScale,
} from "@/lib/font-size";

type FontSizeControlProps = {
  className?: string;
};

export function FontSizeControl({ className = "" }: FontSizeControlProps) {
  const [scale, setScale] = useState<FontSizeScale>(DEFAULT_FONT_SIZE);

  useEffect(() => {
    const current = document.documentElement.getAttribute("data-font-size");
    if (isFontSizeScale(current)) setScale(current);
  }, []);

  const select = (next: FontSizeScale) => {
    applyFontSize(next);
    setScale(next);
  };

  return (
    <div
      className={`toolbar-tabs shrink-0 ${className}`.trim()}
      role="group"
      aria-label="界面字号"
    >
      {FONT_SIZE_SCALES.map((id) => {
        const active = id === scale;
        return (
          <button
            key={id}
            type="button"
            className={`toolbar-tab px-1.5 text-xs sm:px-2.5 sm:text-sm ${active ? "toolbar-tab-active" : ""}`}
            aria-pressed={active}
            title={`字号：${FONT_SIZE_LABELS[id]}`}
            onClick={() => select(id)}
          >
            {FONT_SIZE_LABELS[id]}
          </button>
        );
      })}
    </div>
  );
}
