import { StatCards } from "@/components/StatCards";
import { DailyChart } from "@/components/DailyChart";

export default function Home() {
  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <p className="mb-4 text-sm opacity-60">
        按日聚合：提问数、工具调用、会话数。上下文 token 为 preCompact 近似值。
      </p>
      <section className="mb-8">
        <h2 className="mb-4 text-sm font-medium opacity-70">今日统计</h2>
        <StatCards period="day" />
      </section>
      <section className="mb-8">
        <h2 className="mb-4 text-sm font-medium opacity-70">本周统计</h2>
        <StatCards period="week" />
      </section>
      <section>
        <DailyChart days={14} />
      </section>
    </main>
  );
}
