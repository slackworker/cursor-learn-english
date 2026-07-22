"use client";

import Link from "next/link";
import {
  BookOpen,
  GraduationCap,
  LayoutDashboard,
  MessagesSquare,
  Settings2,
  type LucideIcon,
} from "lucide-react";
import { usePathname } from "next/navigation";

const NAV_ICON_CLASS = "h-4 w-4 shrink-0";
const TAB_ICON_CLASS = "h-[1.125rem] w-[1.125rem] shrink-0";

const NAV_ITEMS: { href: string; label: string; icon: LucideIcon }[] = [
  { href: "/", label: "首页", icon: LayoutDashboard },
  { href: "/sessions", label: "会话", icon: MessagesSquare },
  { href: "/vocab", label: "词汇", icon: BookOpen },
  { href: "/setup", label: "配置", icon: Settings2 },
];

export default function Navbar() {
  const pathname = usePathname();

  const isActive = (href: string) => {
    if (href === "/") return pathname === "/";
    return pathname === href || pathname.startsWith(`${href}/`);
  };

  return (
    <>
      <header className="app-navbar">
        <div className="app-navbar-inner">
          <Link href="/" className="nav-brand shrink-0">
            <GraduationCap className={NAV_ICON_CLASS} aria-hidden />
            <span className="nav-brand-text">
              <span className="hidden min-[380px]:inline">Cursor </span>
              学英语
            </span>
          </Link>

          <nav className="nav-desktop" aria-label="主导航">
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
        </div>
      </header>

      <nav className="nav-bottom" aria-label="手机主导航">
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
          const active = isActive(href);
          return (
            <Link
              key={href}
              href={href}
              className={`nav-tab ${active ? "nav-tab-active" : ""}`}
              aria-current={active ? "page" : undefined}
            >
              <Icon className={TAB_ICON_CLASS} aria-hidden />
              <span>{label}</span>
            </Link>
          );
        })}
      </nav>
    </>
  );
}
