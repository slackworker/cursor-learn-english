"use client";

import Link from "next/link";
import { StatCards } from "@/components/StatCards";
import { DailyChart } from "@/components/DailyChart";
import { RecentSessions } from "@/components/RecentSessions";

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
    </div>
  );
}
