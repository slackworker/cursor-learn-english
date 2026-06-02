"use client";

import { useEffect, useRef, useState } from "react";
import * as echarts from "echarts";

type ByDay = Record<string, Record<string, number>>;

export function DailyChart({
  days = 7,
  onTruncated,
}: {
  days?: number;
  onTruncated?: () => void;
}) {
  const chartRef = useRef<HTMLDivElement>(null);
  const [data, setData] = useState<ByDay | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    setLoading(true);
    setLoadError(false);
    const to = new Date().toISOString().slice(0, 10);
    const from = new Date(Date.now() - days * 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);
    fetch(`/api/events?from=${from}&to=${to}&aggregateOnly=1`)
      .then((r) => r.json())
      .then((res) => {
        setData(res.byDay);
        if (res.truncated) onTruncated?.();
      })
      .catch(() => setLoadError(true))
      .finally(() => setLoading(false));
  }, [days, onTruncated]);

  useEffect(() => {
    if (!chartRef.current || !data) return;

    const dates = Object.keys(data).sort();
    const prompts = dates.map((d) => data[d]?.beforeSubmitPrompt ?? 0);
    const toolCalls = dates.map((d) => data[d]?.postToolUse ?? 0);
    const thoughts = dates.map((d) => data[d]?.afterAgentThought ?? 0);

    const chart = echarts.init(chartRef.current);
    chart.setOption({
      tooltip: { trigger: "axis" },
      legend: { data: ["提问", "工具调用", "Thinking"], bottom: 0 },
      grid: { left: "3%", right: "4%", bottom: "15%", top: "10%", containLabel: true },
      xAxis: { type: "category", data: dates },
      yAxis: { type: "value" },
      series: [
        { name: "提问", type: "line", data: prompts, smooth: true },
        { name: "工具调用", type: "line", data: toolCalls, smooth: true },
        { name: "Thinking", type: "line", data: thoughts, smooth: true },
      ],
    });

    return () => {
      chart.dispose();
    };
  }, [data]);

  if (loading) {
    return (
      <div className="card h-80 animate-pulse border border-base-300 bg-base-200 shadow-sm" />
    );
  }

  if (loadError || !data) {
    return (
      <div className="card border border-base-300 bg-base-100 shadow-sm">
        <div className="card-body p-4">
          <p className="text-base-content/60">无法加载趋势数据</p>
        </div>
      </div>
    );
  }

  return (
    <div className="card border border-base-300 bg-base-100 shadow-sm">
      <div className="card-body p-4">
        <h3 className="mb-2 text-sm font-medium text-base-content/70">
          过去 {days} 天趋势
        </h3>
        <div ref={chartRef} className="h-64 w-full" />
      </div>
    </div>
  );
}
