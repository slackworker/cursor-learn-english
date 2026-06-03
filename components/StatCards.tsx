"use client";

import { useEffect, useState } from "react";

type Stats = {
  prompts: number;
  toolCalls: number;
  toolFailures: number;
  sessions: number;
  thoughts: number;
  fileEdits: number;
  contextTokens: number;
};

export function StatCards({
  period = "week",
  onTruncated,
}: {
  period?: "day" | "week" | "month";
  onTruncated?: () => void;
}) {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/stats?period=${period}`)
      .then((r) => r.json())
      .then((data) => {
        setStats(data);
        if (data.truncated) onTruncated?.();
      })
      .catch(() => setStats(null))
      .finally(() => setLoading(false));
  }, [period, onTruncated]);

  if (loading) {
    return (
      <div className="stat-grid">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="stat-card h-24 animate-pulse bg-base-200" />
        ))}
      </div>
    );
  }

  if (!stats) {
    return (
      <p className="text-sm text-base-content/50">
        无法加载数据，请确认 EVENTS_JSONL_PATH 指向 ~/cursor-events.jsonl 且 Cursor Hooks 已采集事件。
      </p>
    );
  }

  const cards = [
    { label: "提问数", value: stats.prompts },
    { label: "工具调用", value: stats.toolCalls },
    { label: "会话数", value: stats.sessions },
    { label: "Thinking 条数", value: stats.thoughts },
    { label: "文件编辑", value: stats.fileEdits },
  ];

  return (
    <div className="stat-grid">
      {cards.map(({ label, value }) => (
        <div key={label} className="stat-card">
          <div className="stat-card-accent" aria-hidden />
          <p className="stat-card-label">{label}</p>
          <p className="stat-card-value">{value.toLocaleString()}</p>
        </div>
      ))}
    </div>
  );
}
