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
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-5">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="card h-24 animate-pulse bg-base-200 border border-base-300" />
        ))}
      </div>
    );
  }

  if (!stats) {
    return (
      <p className="text-base-content/60">
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
    // { label: "上下文 token 约", value: stats.contextTokens > 0 ? stats.contextTokens.toLocaleString() : "—" },
  ];

  return (
    <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-5">
      {cards.map(({ label, value }) => (
        <div
          key={label}
          className="card border border-base-300 bg-base-100 shadow-sm"
        >
          <div className="card-body p-4">
            <p className="text-sm font-medium text-base-content/60">{label}</p>
            <p className="text-2xl font-semibold text-base-content">{value}</p>
          </div>
        </div>
      ))}
    </div>
  );
}
