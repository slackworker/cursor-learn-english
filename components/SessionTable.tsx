"use client";

import Link from "next/link";
import { useState } from "react";
import useSWR from "swr";
import { RefreshButton } from "@/components/RefreshButton";
import { SessionTitleView } from "@/components/SessionTitleView";
import { EmptyState, LoadingState } from "@/components/ui/EmptyState";
import { Pagination } from "@/components/ui/Pagination";
import { formatLocalDateTime } from "@/lib/format-datetime";
import { sessionsSwrOptions } from "@/lib/sessions-swr";
import type { DomContextBlock } from "@/lib/parse-dom-context";

type Session = {
  session_id: string;
  title?: string;
  title_dom_contexts?: DomContextBlock[];
  title_body?: string;
  timestamp?: string;
  start?: string;
  last_reply?: string;
  last_activity?: string;
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

export function SessionTable() {
  const [page, setPage] = useState(1);
  const { data, error, isLoading, isValidating, mutate } = useSWR<SessionsResponse>(
    sessionsKey(page),
    sessionsSwrOptions
  );

  const sessions = data?.sessions ?? [];
  const total = data?.total ?? 0;
  const loadError = error ? "加载失败，请稍后重试。" : null;
  const showInitialLoading = isLoading && sessions.length === 0;

  if (showInitialLoading) {
    return <LoadingState />;
  }

  if (loadError && sessions.length === 0) {
    return (
      <div className="space-y-3">
        <EmptyState>{loadError}</EmptyState>
        <div className="flex justify-center">
          <RefreshButton onRefresh={() => void mutate()} isValidating={isValidating} />
        </div>
      </div>
    );
  }

  if (!loadError && !isValidating && sessions.length === 0) {
    return (
      <div className="space-y-3">
        <EmptyState>
          暂无会话。请确保 Cursor Hooks 已配置 sessionStart / sessionEnd。
        </EmptyState>
        <div className="flex justify-center">
          <RefreshButton onRefresh={() => void mutate()} isValidating={isValidating} />
        </div>
      </div>
    );
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-end gap-2">
        {isValidating ? (
          <p className="text-xs text-base-content/40">更新中…</p>
        ) : null}
        <RefreshButton onRefresh={() => void mutate()} isValidating={isValidating} />
      </div>
      <div
        className={`data-table-wrap ${isValidating && sessions.length > 0 ? "opacity-80 transition-opacity" : ""}`}
      >
        <table className="data-table table-fixed">
          <colgroup>
            <col />
            <col className="w-44" />
          </colgroup>
          <thead>
            <tr>
              <th>会话标题</th>
              <th className="text-center">最近活跃</th>
            </tr>
          </thead>
          <tbody>
            {sessions.map((s) => (
              <tr key={s.session_id}>
                <td className="min-w-0 overflow-hidden">
                  <Link
                    href={`/sessions/${s.session_id}`}
                    title={s.title?.trim() || s.session_id}
                    className="data-table-link block min-w-0 overflow-hidden"
                  >
                    <SessionTitleView
                      title={s.title}
                      domContexts={s.title_dom_contexts}
                      body={s.title_body}
                      fallback={`会话 ${s.session_id?.slice(0, 8)}…`}
                      variant="inline"
                    />
                  </Link>
                </td>
                <td className="whitespace-nowrap text-center tabular-nums">
                  {formatLocalDateTime(s.last_activity ?? s.last_reply ?? s.start ?? s.timestamp)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Pagination
        page={page}
        totalPages={totalPages}
        disabled={isValidating}
        onPrev={() => setPage((p) => Math.max(1, p - 1))}
        onNext={() => setPage((p) => Math.min(totalPages, p + 1))}
        summary={`每页 ${PAGE_SIZE} 条，共 ${total} 条`}
      />
      {loadError ? (
        <p className="text-center text-sm text-error">{loadError}</p>
      ) : null}
    </div>
  );
}
