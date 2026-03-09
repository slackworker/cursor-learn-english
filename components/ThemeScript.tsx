"use client";

import { useEffect } from "react";

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
  }, []);

  return null;
}
