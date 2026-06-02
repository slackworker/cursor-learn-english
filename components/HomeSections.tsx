"use client";

import { useCallback, useState } from "react";
import { StatCards } from "@/components/StatCards";
import { DailyChart } from "@/components/DailyChart";

export function HomeSections() {
  const [truncated, setTruncated] = useState(false);
  const onTruncated = useCallback(() => setTruncated(true), []);

  return (
    <>
      {truncated && (
        <div role="alert" className="alert alert-warning mb-4 py-2 text-sm">
          <span>
            JSONL 文件较大，当前仅读取尾部片段，统计可能不完整。
          </span>
        </div>
      )}
      <section className="mb-8">
        <h2 className="mb-4 text-sm font-medium opacity-70">今日统计</h2>
        <StatCards period="day" onTruncated={onTruncated} />
      </section>
      <section className="mb-8">
        <h2 className="mb-4 text-sm font-medium opacity-70">本周统计</h2>
        <StatCards period="week" onTruncated={onTruncated} />
      </section>
      <section>
        <DailyChart days={14} onTruncated={onTruncated} />
      </section>
    </>
  );
}
