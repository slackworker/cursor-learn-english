"use client";

import Link from "next/link";
import { BookOpen, Brain, LineChart, MessagesSquare } from "lucide-react";
import { StatCards } from "@/components/StatCards";
import { DailyChart } from "@/components/DailyChart";
import { RecentSessions } from "@/components/RecentSessions";

const QUICK_LINKS = [
  {
    href: "/sessions",
    label: "会话列表",
    desc: "浏览完整对话与历史",
    icon: MessagesSquare,
  },
  {
    href: "/vocab",
    label: "词汇统计",
    desc: "高频词与短语复习",
    icon: BookOpen,
  },
  {
    href: "/thinking",
    label: "Thinking 语料",
    desc: "阅读 AI 推理原文",
    icon: Brain,
  },
  {
    href: "/stats",
    label: "详细统计",
    desc: "按日/周指标与趋势",
    icon: LineChart,
  },
] as const;

export function DashboardHome() {
  return (
    <div className="space-y-10">
      <section>
        <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
          <h2 className="section-title mb-0">今日概览</h2>
          <Link href="/stats" className="text-xs font-medium text-primary hover:underline">
            查看完整统计 →
          </Link>
        </div>
        <StatCards period="day" />
      </section>

      <section className="grid gap-6 lg:grid-cols-5 lg:gap-8">
        <div className="lg:col-span-3">
          <DailyChart days={7} />
        </div>
        <div className="lg:col-span-2">
          <RecentSessions limit={5} />
        </div>
      </section>

      <section>
        <h2 className="section-title">快速入口</h2>
        <div className="dashboard-link-grid">
          {QUICK_LINKS.map(({ href, label, desc, icon: Icon }) => (
            <Link key={href} href={href} className="dashboard-link-card group">
              <span className="dashboard-link-icon" aria-hidden>
                <Icon className="h-5 w-5" />
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-semibold text-base-content group-hover:text-primary">
                  {label}
                </span>
                <span className="mt-0.5 block text-xs leading-relaxed text-base-content/50">
                  {desc}
                </span>
              </span>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
