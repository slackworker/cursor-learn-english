"use client";

import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";
import { FontSizeControl } from "@/components/FontSizeControl";
import { Surface } from "@/components/ui/Surface";

const LIGHT_THEME = "corporate";
const DARK_THEME = "business";

export function AppearanceSettingsPanel() {
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    const current = document.documentElement.getAttribute("data-theme");
    setIsDark(current === DARK_THEME);
  }, []);

  const setTheme = (dark: boolean) => {
    const next = dark ? DARK_THEME : LIGHT_THEME;
    document.documentElement.setAttribute("data-theme", next);
    localStorage.setItem("theme", next);
    setIsDark(dark);
  };

  return (
    <Surface className="space-y-5">
      <div>
        <p className="tts-label">主题</p>
        <div className="toolbar-tabs" role="group" aria-label="主题">
          <button
            type="button"
            className={`toolbar-tab gap-1.5 ${!isDark ? "toolbar-tab-active" : ""}`}
            aria-pressed={!isDark}
            onClick={() => setTheme(false)}
          >
            <Sun className="h-3.5 w-3.5" aria-hidden />
            浅色
          </button>
          <button
            type="button"
            className={`toolbar-tab gap-1.5 ${isDark ? "toolbar-tab-active" : ""}`}
            aria-pressed={isDark}
            onClick={() => setTheme(true)}
          >
            <Moon className="h-3.5 w-3.5" aria-hidden />
            深色
          </button>
        </div>
      </div>

      <div>
        <p className="tts-label">界面字号</p>
        <FontSizeControl />
      </div>
    </Surface>
  );
}
