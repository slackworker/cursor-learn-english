"use client";

import { useEffect } from "react";
import { applyFontSize, isFontSizeScale, readStoredFontSize } from "@/lib/font-size";

export default function ThemeScript() {
  useEffect(() => {
    const saved = localStorage.getItem("theme");
    if (saved) {
      document.documentElement.setAttribute("data-theme", saved);
    } else {
      const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
      const initial = prefersDark ? "business" : "corporate";
      document.documentElement.setAttribute("data-theme", initial);
      localStorage.setItem("theme", initial);
    }

    // Prefer an explicit localStorage choice. Otherwise keep the inline layout
    // script's pick (e.g. first visit on touch → lg) instead of forcing md.
    try {
      const stored = localStorage.getItem("font-size");
      if (stored) {
        applyFontSize(readStoredFontSize());
        return;
      }
    } catch {
      /* ignore */
    }

    const current = document.documentElement.getAttribute("data-font-size");
    if (!isFontSizeScale(current)) {
      applyFontSize(readStoredFontSize());
    }
  }, []);

  return null;
}
