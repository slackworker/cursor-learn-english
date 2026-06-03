"use client";

import { useEffect, useRef, useState } from "react";
import * as echarts from "echarts";
import { Surface } from "@/components/ui/Surface";

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

    const isDark = document.documentElement.getAttribute("data-theme") === "business";
    const textColor = isDark ? "#a1a1aa" : "#71717a";
    const gridColor = isDark ? "#3f3f46" : "#e4e4e7";

    const chart = echarts.init(chartRef.current);
    chart.setOption({
      tooltip: {
        trigger: "axis",
        backgroundColor: isDark ? "#27272a" : "#fff",
        borderColor: gridColor,
        textStyle: { color: isDark ? "#fafafa" : "#18181b" },
      },
      legend: {
        data: ["提问", "工具调用", "Thinking"],
        bottom: 0,
        textStyle: { color: textColor },
      },
      grid: { left: "3%", right: "4%", bottom: "15%", top: "10%", containLabel: true },
      xAxis: {
        type: "category",
        data: dates,
        axisLabel: { color: textColor, fontSize: 11 },
        axisLine: { lineStyle: { color: gridColor } },
      },
      yAxis: {
        type: "value",
        axisLabel: { color: textColor, fontSize: 11 },
        splitLine: { lineStyle: { color: gridColor, type: "dashed" } },
      },
      series: [
        { name: "提问", type: "line", data: prompts, smooth: true, symbol: "circle", symbolSize: 6 },
        { name: "工具调用", type: "line", data: toolCalls, smooth: true, symbol: "circle", symbolSize: 6 },
        { name: "Thinking", type: "line", data: thoughts, smooth: true, symbol: "circle", symbolSize: 6 },
      ],
    });

    const onResize = () => chart.resize();
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      chart.dispose();
    };
  }, [data]);

  if (loading) {
    return <div className="surface h-80 animate-pulse bg-base-200" />;
  }

  if (loadError || !data) {
    return (
      <Surface>
        <p className="text-sm text-base-content/50">无法加载趋势数据</p>
      </Surface>
    );
  }

  return (
    <Surface>
      <h3 className="section-title mb-4">过去 {days} 天趋势</h3>
      <div ref={chartRef} className="h-72 w-full" />
    </Surface>
  );
}
