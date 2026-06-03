"use client";

import Link from "next/link";
import { Moon, Sun, Volume2 } from "lucide-react";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { useTts } from "@/components/TtsProvider";

const NAV_ICON_CLASS = "h-4 w-4 shrink-0";

const NAV_ITEMS = [
  { href: "/", label: "首页" },
  { href: "/sessions", label: "会话" },
  { href: "/vocab", label: "词汇" },
  { href: "/thinking", label: "语料" },
  { href: "/stats", label: "统计" },
];

const LIGHT_THEME = "corporate";
const DARK_THEME = "business";

export default function Navbar() {
  const pathname = usePathname();
  const { openDrawer } = useTts();
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    const current = document.documentElement.getAttribute("data-theme");
    setIsDark(current === DARK_THEME);
  }, []);

  const toggleTheme = () => {
    const next = isDark ? LIGHT_THEME : DARK_THEME;
    document.documentElement.setAttribute("data-theme", next);
    localStorage.setItem("theme", next);
    setIsDark(!isDark);
  };

  const isActive = (href: string) => {
    if (href === "/") return pathname === "/";
    return pathname === href || pathname.startsWith(`${href}/`);
  };

  return (
    <header className="app-navbar">
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
        <Link href="/" className="nav-brand">
          Cursor 学英语
        </Link>
        <div className="flex items-center gap-2 sm:gap-3">
          <nav className="flex items-center gap-0.5 sm:gap-1">
            {NAV_ITEMS.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={`nav-link ${isActive(item.href) ? "nav-link-active" : ""}`}
              >
                {item.label}
              </Link>
            ))}
          </nav>
          <button
            type="button"
            className="theme-toggle"
            onClick={openDrawer}
            aria-label="朗读设置"
            title="朗读设置"
          >
            <Volume2 className={NAV_ICON_CLASS} aria-hidden />
          </button>
          <button
            type="button"
            className="theme-toggle"
            onClick={toggleTheme}
            aria-label={isDark ? "切换到浅色模式" : "切换到深色模式"}
          >
            {isDark ? (
              <Sun className={NAV_ICON_CLASS} aria-hidden />
            ) : (
              <Moon className={NAV_ICON_CLASS} aria-hidden />
            )}
          </button>
        </div>
      </div>
    </header>
  );
}
