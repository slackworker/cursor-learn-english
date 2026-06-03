"use client";

import { useEffect, useRef, useState } from "react";
import * as echarts from "echarts";
import { Surface } from "@/components/ui/Surface";

const HOUR_AXIS_START = 3;

const HOUR_LABELS = Array.from(
  { length: 24 },
  (_, i) => `${(HOUR_AXIS_START + i) % 24}时`
);

function rotateHourCounts(counts: number[]): number[] {
  return Array.from({ length: 24 }, (_, i) => counts[(HOUR_AXIS_START + i) % 24] ?? 0);
}

export function ActiveHoursChart({
  days = 7,
  onTruncated,
}: {
  days?: number;
  onTruncated?: () => void;
}) {
  const chartRef = useRef<HTMLDivElement>(null);
  const [hours, setHours] = useState<number[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    setLoading(true);
    setLoadError(false);
    const to = new Date().toISOString().slice(0, 10);
    const from = new Date(Date.now() - days * 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);
    const tzOffset = new Date().getTimezoneOffset();
    fetch(
      `/api/events?from=${from}&to=${to}&aggregateOnly=1&tzOffset=${tzOffset}`
    )
      .then((r) => r.json())
      .then((res) => {
        setHours(Array.isArray(res.promptsByHour) ? res.promptsByHour : null);
        if (res.truncated) onTruncated?.();
      })
      .catch(() => setLoadError(true))
      .finally(() => setLoading(false));
  }, [days, onTruncated]);

  useEffect(() => {
    if (!chartRef.current || !hours) return;

    const isDark = document.documentElement.getAttribute("data-theme") === "business";
    const textColor = isDark ? "#a1a1aa" : "#71717a";
    const gridColor = isDark ? "#3f3f46" : "#e4e4e7";
    const barColor = isDark ? "#818cf8" : "#6366f1";

    const chart = echarts.init(chartRef.current);
    chart.setOption({
      tooltip: {
        trigger: "axis",
        axisPointer: { type: "shadow" },
        backgroundColor: isDark ? "#27272a" : "#fff",
        borderColor: gridColor,
        textStyle: { color: isDark ? "#fafafa" : "#18181b" },
        formatter: (params: unknown) => {
          const p = (Array.isArray(params) ? params[0] : params) as {
            name?: string;
            value?: number;
          };
          return `${p.name ?? ""}<br/>提问 ${p.value ?? 0} 次`;
        },
      },
      grid: { left: "3%", right: "4%", bottom: "12%", top: "10%", containLabel: true },
      xAxis: {
        type: "category",
        data: HOUR_LABELS,
        axisLabel: {
          color: textColor,
          fontSize: 10,
          interval: 2,
        },
        axisLine: { lineStyle: { color: gridColor } },
      },
      yAxis: {
        type: "value",
        name: "提问数",
        nameTextStyle: { color: textColor, fontSize: 11 },
        axisLabel: { color: textColor, fontSize: 11 },
        splitLine: { lineStyle: { color: gridColor, type: "dashed" } },
      },
      series: [
        {
          name: "提问",
          type: "bar",
          data: rotateHourCounts(hours),
          itemStyle: {
            color: barColor,
            borderRadius: [4, 4, 0, 0],
          },
          emphasis: { itemStyle: { color: isDark ? "#a5b4fc" : "#4f46e5" } },
        },
      ],
    });

    const onResize = () => chart.resize();
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      chart.dispose();
    };
  }, [hours]);

  if (loading) {
    return <div className="surface h-80 animate-pulse bg-base-200" />;
  }

  if (loadError || !hours) {
    return (
      <Surface>
        <p className="text-sm text-base-content/50">无法加载活跃时段数据</p>
      </Surface>
    );
  }

  const total = hours.reduce((a, b) => a + b, 0);

  return (
    <Surface>
      <div className="mb-4">
        <h3 className="section-title">活跃时段</h3>
        <p className="mt-1 text-sm text-base-content/55">
          过去 {days} 天 · 按本地时区 · 共 {total} 次提问
        </p>
      </div>
      <div ref={chartRef} className="h-72 w-full" />
    </Surface>
  );
}
