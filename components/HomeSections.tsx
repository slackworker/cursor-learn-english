"use client";

import { useCallback, useState } from "react";
import { StatCards } from "@/components/StatCards";
import { DailyChart } from "@/components/DailyChart";

export function HomeSections() {
  const [truncated, setTruncated] = useState(false);
  const onTruncated = useCallback(() => setTruncated(true), []);

  return (
    <div className="space-y-10">
      {truncated && (
        <div role="alert" className="banner-warning">
          JSONL 文件较大，当前仅读取尾部片段，统计可能不完整。
        </div>
      )}
      <section>
        <h2 className="section-title">今日统计</h2>
        <StatCards period="day" onTruncated={onTruncated} />
      </section>
      <section>
        <h2 className="section-title">本周统计</h2>
        <StatCards period="week" onTruncated={onTruncated} />
      </section>
      <section>
        <DailyChart days={14} onTruncated={onTruncated} />
      </section>
    </div>
  );
}
