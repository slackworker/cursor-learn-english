"use client";

import { ActiveHoursChart } from "@/components/ActiveHoursChart";
import { PromptContributionGraph } from "@/components/PromptContributionGraph";
import { RecentSessions } from "@/components/RecentSessions";
import { Surface } from "@/components/ui/Surface";

export function DashboardHome() {
  return (
    <div className="space-y-10">
      <section>
        <Surface padding="lg">
          <div className="mb-5">
            <h2 className="section-title mb-1">过去一年提问</h2>
            <p className="text-sm text-base-content/55">
              基于用户提示词语料，颜色越深表示当日提问越多
            </p>
          </div>
          <PromptContributionGraph variant="hero" />
        </Surface>
      </section>

      <section className="grid gap-6 lg:grid-cols-5 lg:gap-8">
        <div className="lg:col-span-3">
          <ActiveHoursChart />
        </div>
        <div className="lg:col-span-2">
          <RecentSessions limit={5} />
        </div>
      </section>
    </div>
  );
}
