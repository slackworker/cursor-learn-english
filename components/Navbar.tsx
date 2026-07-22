"use client";

import Link from "next/link";
import {
  BookOpen,
  GraduationCap,
  LayoutDashboard,
  MessagesSquare,
  Moon,
  Settings2,
  Sun,
  Volume2,
  type LucideIcon,
} from "lucide-react";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { useTts } from "@/components/TtsProvider";
import { ServerStatusBadge } from "@/components/ServerStatus";

const NAV_ICON_CLASS = "h-4 w-4 shrink-0";

const NAV_ITEMS: { href: string; label: string; icon: LucideIcon }[] = [
  { href: "/", label: "首页", icon: LayoutDashboard },
  { href: "/sessions", label: "会话", icon: MessagesSquare },
  { href: "/vocab", label: "词汇", icon: BookOpen },
  { href: "/setup", label: "配置", icon: Settings2 },
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
        <Link href="/" className="nav-brand shrink-0">
          <GraduationCap className={NAV_ICON_CLASS} aria-hidden />
          <span className="whitespace-nowrap">Cursor 学英语</span>
        </Link>
        <div className="flex items-center gap-2 sm:gap-3">
          <nav className="flex items-center gap-0.5 sm:gap-1">
            {NAV_ITEMS.map(({ href, label, icon: Icon }) => (
              <Link
                key={href}
                href={href}
                className={`nav-link ${isActive(href) ? "nav-link-active" : ""}`}
              >
                <span className="nav-link-icon" aria-hidden>
                  <Icon className={NAV_ICON_CLASS} />
                </span>
                <span className="nav-link-label">{label}</span>
              </Link>
            ))}
          </nav>
          <ServerStatusBadge />
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
