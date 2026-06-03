"use client";

import Link from "next/link";
import { useState } from "react";
import useSWR from "swr";

type Session = {
  session_id: string;
  title?: string;
  reason?: string;
  duration_ms?: number;
  timestamp?: string;
  start?: string;
  is_open?: boolean;
};

type SessionsResponse = {
  sessions: Session[];
  total: number;
};

const PAGE_SIZE = 20;

function sessionsKey(page: number): string {
  const url = new URL("/api/sessions", typeof window === "undefined" ? "http://localhost" : window.location.origin);
  url.searchParams.set("offset", String((page - 1) * PAGE_SIZE));
  url.searchParams.set("limit", String(PAGE_SIZE));
  return url.pathname + url.search;
}

function formatMs(ms?: number) {
  if (ms == null) return "—";
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)}min`;
}

function formatLocalTime(value?: string) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value.slice(0, 19).replace("T", " ");
  }
  return new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(date);
}

export function SessionTable() {
  const [page, setPage] = useState(1);
  const { data, error, isLoading, isValidating } = useSWR<SessionsResponse>(
    sessionsKey(page)
  );

  const sessions = data?.sessions ?? [];
  const total = data?.total ?? 0;
  const loadError = error ? "加载失败，请稍后重试。" : null;
  const showInitialLoading = isLoading && sessions.length === 0;

  if (showInitialLoading) {
    return <div className="rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-700 dark:bg-zinc-900">加载中…</div>;
  }

  if (loadError && sessions.length === 0) {
    return (
      <div className="rounded-xl border border-zinc-200 bg-white p-6 text-zinc-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-400">
        {loadError}
      </div>
    );
  }

  if (!loadError && !isValidating && sessions.length === 0) {
    return (
      <div className="rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-700 dark:bg-zinc-900">
        <p className="text-zinc-500 dark:text-zinc-400">暂无会话记录。请确保 Cursor Hooks 已配置 sessionStart / sessionEnd。</p>
      </div>
    );
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const canPrev = page > 1;
  const canNext = page < totalPages;

  return (
    <div className="space-y-3">
      {isValidating ? (
        <p className="text-right text-xs text-zinc-400 dark:text-zinc-500">更新中…</p>
      ) : null}
      <div
        className={`overflow-hidden rounded-xl border border-zinc-200 bg-white dark:border-zinc-700 dark:bg-zinc-900 ${
          isValidating && sessions.length > 0 ? "opacity-80 transition-opacity" : ""
        }`}
      >
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-zinc-200 bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800">
              <th className="p-3 font-medium text-zinc-700 dark:text-zinc-300">会话标题</th>
              <th className="p-3 font-medium text-zinc-700 dark:text-zinc-300">开始时间</th>
              <th className="p-3 font-medium text-zinc-700 dark:text-zinc-300">时长</th>
              <th className="p-3 font-medium text-zinc-700 dark:text-zinc-300">状态/结束原因</th>
            </tr>
          </thead>
          <tbody>
            {sessions.map((s) => (
              <tr key={s.session_id} className="border-b border-zinc-100 dark:border-zinc-700">
                <td className="p-3 text-zinc-600 dark:text-zinc-400">
                  <Link href={`/sessions/${s.session_id}`} className="block max-w-[28rem] truncate text-blue-600 hover:underline dark:text-blue-400">
                    {s.title || `会话 ${s.session_id?.slice(0, 8)}…`}
                  </Link>
                  <div className="font-mono text-xs text-zinc-400 dark:text-zinc-500">{s.session_id?.slice(0, 8)}…</div>
                </td>
                <td className="p-3 text-zinc-600 dark:text-zinc-400">
                  {formatLocalTime(s.start ?? s.timestamp)}
                </td>
                <td className="p-3 text-zinc-600 dark:text-zinc-400">{formatMs(s.duration_ms)}</td>
                <td className="p-3 text-zinc-600 dark:text-zinc-400">
                  {s.is_open ? "进行中" : (s.reason ?? "—")}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex items-center justify-between text-sm text-zinc-500 dark:text-zinc-400">
        <span>每页 {PAGE_SIZE} 条，共 {total} 条</span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={!canPrev || isValidating}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            className="rounded border border-zinc-300 px-3 py-1 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-600"
          >
            上一页
          </button>
          <span>第 {page} / {totalPages} 页</span>
          <button
            type="button"
            disabled={!canNext || isValidating}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            className="rounded border border-zinc-300 px-3 py-1 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-600"
          >
            下一页
          </button>
        </div>
      </div>
      {loadError ? (
        <p className="text-center text-sm text-red-500 dark:text-red-400">{loadError}</p>
      ) : null}
    </div>
  );
}
