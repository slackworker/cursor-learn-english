"use client";

import { useEffect, useMemo, useState } from "react";
import {
  buildContributionWeeks,
  contributionLevel,
  type ContributionCell,
} from "@/lib/prompt-contrib";

type ByDay = Record<string, number>;

const DAY_LABELS = ["日", "二", "四", "六"];
const MONTH_LABELS = [
  "1月",
  "2月",
  "3月",
  "4月",
  "5月",
  "6月",
  "7月",
  "8月",
  "9月",
  "10月",
  "11月",
  "12月",
];

function maxCountInWeeks(weeks: ContributionCell[][]): number {
  let max = 0;
  for (const week of weeks) {
    for (const cell of week) {
      if (cell.count > max) max = cell.count;
    }
  }
  return max;
}

function formatTooltip(date: string, count: number): string {
  const n = new Date(`${date}T12:00:00.000Z`);
  const label = n.toLocaleDateString("zh-CN", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "short",
  });
  if (count === 0) return `${label}：无提问`;
  return `${label}：${count} 条提问`;
}

function monthMarkers(weeks: ContributionCell[][]): { weekIndex: number; label: string }[] {
  const markers: { weekIndex: number; label: string }[] = [];
  let lastMonth = -1;
  weeks.forEach((week, wi) => {
    const first = week.find((c) => c.date);
    if (!first?.date) return;
    const month = Number(first.date.slice(5, 7)) - 1;
    if (month !== lastMonth) {
      markers.push({ weekIndex: wi, label: MONTH_LABELS[month] });
      lastMonth = month;
    }
  });
  return markers;
}

export function PromptContributionGraph({
  className = "",
  days = 364,
  variant = "hero",
}: {
  className?: string;
  days?: number;
  variant?: "hero" | "compact";
}) {
  const [byDay, setByDay] = useState<ByDay | null>(null);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch("/api/prompts?aggregateOnly=1")
      .then((r) => r.json())
      .then((res) => {
        setByDay(res.byDay ?? {});
        setTotal(res.total ?? 0);
      })
      .catch(() => {
        setByDay({});
        setTotal(0);
      })
      .finally(() => setLoading(false));
  }, []);

  const weeks = useMemo(
    () => (byDay ? buildContributionWeeks(byDay, days) : []),
    [byDay, days]
  );
  const max = useMemo(() => maxCountInWeeks(weeks), [weeks]);
  const months = useMemo(() => monthMarkers(weeks), [weeks]);

  const rootClass = [
    "prompt-contrib",
    variant === "hero" ? "prompt-contrib-hero" : "prompt-contrib-compact",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  if (loading) {
    return (
      <div
        className={`${rootClass} prompt-contrib-loading`.trim()}
        aria-hidden
      />
    );
  }

  const grid = (
    <div className="prompt-contrib-grid">
      {weeks.map((week, wi) => (
        <div key={wi} className="prompt-contrib-week">
          {week.map((cell, di) => (
            <span
              key={`${wi}-${di}`}
              className={`prompt-contrib-cell prompt-contrib-l${contributionLevel(cell.count, max)}${cell.date ? "" : " prompt-contrib-pad"}`}
              title={cell.date ? formatTooltip(cell.date, cell.count) : undefined}
            />
          ))}
        </div>
      ))}
    </div>
  );

  if (variant === "compact") {
    return (
      <div
        className={rootClass}
        role="img"
        aria-label={`过去一年共 ${total} 条用户提问`}
      >
        {grid}
      </div>
    );
  }

  return (
    <div className={rootClass}>
      <div className="prompt-contrib-body">
        <div className="prompt-contrib-day-labels" aria-hidden>
          {DAY_LABELS.map((label) => (
            <span key={label}>{label}</span>
          ))}
        </div>
        <div className="prompt-contrib-chart">
          <div className="prompt-contrib-months" aria-hidden>
            {weeks.map((_, wi) => {
              const marker = months.find((m) => m.weekIndex === wi);
              return (
                <span key={wi} className="prompt-contrib-month-slot">
                  {marker?.label ?? ""}
                </span>
              );
            })}
          </div>
          {grid}
        </div>
      </div>
      <div className="prompt-contrib-footer">
        <p className="text-sm text-base-content/70">
          过去一年共 <span className="font-semibold text-base-content">{total.toLocaleString()}</span> 条提问
        </p>
        <div className="prompt-contrib-legend" aria-hidden>
          <span className="text-xs text-base-content/45">少</span>
          {[0, 1, 2, 3, 4].map((level) => (
            <span key={level} className={`prompt-contrib-cell prompt-contrib-l${level}`} />
          ))}
          <span className="text-xs text-base-content/45">多</span>
        </div>
      </div>
    </div>
  );
}
