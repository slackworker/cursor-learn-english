"use client";

import { useEffect, useRef, useState } from "react";
import type { ECharts } from "echarts";
import * as echarts from "echarts";
import { Surface } from "@/components/ui/Surface";

const HOUR_AXIS_START = 3;

const HOUR_LABELS = Array.from(
  { length: 24 },
  (_, i) => `${(HOUR_AXIS_START + i) % 24}时`
);

type ActiveHoursRange = 7 | 30;

const RANGES: { value: ActiveHoursRange; label: string }[] = [
  { value: 7, label: "7 天" },
  { value: 30, label: "30 天" },
];

function rotateHourCounts(counts: number[]): number[] {
  return Array.from({ length: 24 }, (_, i) => counts[(HOUR_AXIS_START + i) % 24] ?? 0);
}

function buildChartOption(hours: number[]) {
  const isDark = document.documentElement.getAttribute("data-theme") === "business";
  const textColor = isDark ? "#a1a1aa" : "#71717a";
  const gridColor = isDark ? "#3f3f46" : "#e4e4e7";
  const barColor = isDark ? "#818cf8" : "#6366f1";

  return {
    tooltip: {
      trigger: "axis" as const,
      axisPointer: { type: "shadow" as const },
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
      type: "category" as const,
      data: HOUR_LABELS,
      axisLabel: {
        color: textColor,
        fontSize: 10,
        interval: 2,
      },
      axisLine: { lineStyle: { color: gridColor } },
    },
    yAxis: {
      type: "value" as const,
      name: "提问数",
      nameTextStyle: { color: textColor, fontSize: 11 },
      axisLabel: { color: textColor, fontSize: 11 },
      splitLine: { lineStyle: { color: gridColor, type: "dashed" as const } },
    },
    series: [
      {
        name: "提问",
        type: "bar" as const,
        data: rotateHourCounts(hours),
        itemStyle: {
          color: barColor,
          borderRadius: [4, 4, 0, 0],
        },
        emphasis: { itemStyle: { color: isDark ? "#a5b4fc" : "#4f46e5" } },
      },
    ],
  };
}

export function ActiveHoursChart({
  onTruncated,
}: {
  onTruncated?: () => void;
}) {
  const chartRef = useRef<HTMLDivElement>(null);
  const chartInstanceRef = useRef<ECharts | null>(null);
  const [range, setRange] = useState<ActiveHoursRange>(7);
  const [hours, setHours] = useState<number[] | null>(null);
  const [refreshing, setRefreshing] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [truncated, setTruncated] = useState(false);

  useEffect(() => {
    setRefreshing(true);
    setLoadError(false);
    setTruncated(false);
    const to = new Date().toISOString().slice(0, 10);
    const from = new Date(Date.now() - range * 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);
    const tzOffset = new Date().getTimezoneOffset();
    fetch(
      `/api/events?from=${from}&to=${to}&aggregateOnly=1&tzOffset=${tzOffset}`
    )
      .then((r) => r.json())
      .then((res) => {
        setHours(Array.isArray(res.promptsByHour) ? res.promptsByHour : null);
        if (res.truncated) {
          setTruncated(true);
          onTruncated?.();
        }
      })
      .catch(() => setLoadError(true))
      .finally(() => setRefreshing(false));
  }, [range, onTruncated]);

  useEffect(() => {
    if (!chartRef.current || !hours) return;

    const option = buildChartOption(hours);
    let chart = chartInstanceRef.current;
    if (!chart) {
      chart = echarts.init(chartRef.current);
      chartInstanceRef.current = chart;
    }
    chart.setOption(option, true);

    const onResize = () => chart?.resize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [hours]);

  useEffect(() => {
    return () => {
      chartInstanceRef.current?.dispose();
      chartInstanceRef.current = null;
    };
  }, []);

  const total = hours?.reduce((a, b) => a + b, 0) ?? 0;
  const initialLoading = refreshing && hours === null;
  const showTotal = hours !== null && !loadError;

  return (
    <Surface>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="section-title">活跃时段</h3>
          <p className="mt-1 text-sm text-base-content/55">
            过去 {range} 天
            {showTotal
              ? ` · 共 ${total} 次提问`
              : initialLoading
                ? " · 加载中…"
                : ""}
            {showTotal ? " · 按本地时区汇总" : ""}
            {truncated ? " · 数据已截断，结果可能不完整" : ""}
          </p>
        </div>
        <div className="toolbar-tabs shrink-0" role="tablist" aria-label="活跃时段范围">
          {RANGES.map(({ value, label }) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={range === value}
              className={`toolbar-tab ${range === value ? "toolbar-tab-active" : ""}`}
              onClick={() => setRange(value)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      {loadError && hours === null ? (
        <p className="text-sm text-base-content/50">无法加载活跃时段数据</p>
      ) : initialLoading ? (
        <div className="h-72 w-full animate-pulse rounded-lg bg-base-200" />
      ) : (
        <div
          ref={chartRef}
          className={`h-72 w-full transition-opacity duration-150 ${refreshing ? "opacity-60" : "opacity-100"}`}
        />
      )}
    </Surface>
  );
}
