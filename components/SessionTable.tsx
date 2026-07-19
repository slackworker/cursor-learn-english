"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
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
  is_subagent?: boolean;
  parent_session_id?: string;
  subagent_type?: string;
};

type SessionsResponse = {
  sessions: Session[];
  total: number;
};

const PAGE_SIZE = 20;
const INCLUDE_SUBAGENTS_STORAGE_KEY = "sessions_include_subagents";

function readIncludeSubagents(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(INCLUDE_SUBAGENTS_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

function writeIncludeSubagents(value: boolean): void {
  try {
    window.localStorage.setItem(INCLUDE_SUBAGENTS_STORAGE_KEY, value ? "1" : "0");
  } catch {
    // ignore quota / private mode
  }
}

function sessionsKey(page: number, includeSubagents: boolean): string {
  const url = new URL("/api/sessions", typeof window === "undefined" ? "http://localhost" : window.location.origin);
  url.searchParams.set("offset", String((page - 1) * PAGE_SIZE));
  url.searchParams.set("limit", String(PAGE_SIZE));
  if (includeSubagents) url.searchParams.set("includeSubagents", "1");
  return url.pathname + url.search;
}

export function SessionTable() {
  const [page, setPage] = useState(1);
  const [includeSubagents, setIncludeSubagents] = useState(false);
  const [prefsReady, setPrefsReady] = useState(false);

  useEffect(() => {
    setIncludeSubagents(readIncludeSubagents());
    setPrefsReady(true);
  }, []);

  const { data, error, isLoading, isValidating, mutate } = useSWR<SessionsResponse>(
    prefsReady ? sessionsKey(page, includeSubagents) : null,
    sessionsSwrOptions
  );

  const sessions = data?.sessions ?? [];
  const total = data?.total ?? 0;
  const loadError = error ? "加载失败，请稍后重试。" : null;
  const showInitialLoading = (!prefsReady || isLoading) && sessions.length === 0;

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
        <div className="flex flex-wrap items-center justify-end gap-3">
          <label className="label cursor-pointer gap-2 p-0">
            <span className="text-sm text-base-content/60">加载子代理会话</span>
            <input
              type="checkbox"
              className="toggle toggle-sm toggle-primary"
              checked={includeSubagents}
              onChange={(e) => {
                const next = e.target.checked;
                writeIncludeSubagents(next);
                setIncludeSubagents(next);
                setPage(1);
              }}
            />
          </label>
          <RefreshButton onRefresh={() => void mutate()} isValidating={isValidating} />
        </div>
        <EmptyState>
          {includeSubagents
            ? "暂无会话（含子代理）。请确保已配置 sessionStart/End 与 subagentStart/Stop。"
            : "暂无会话。请确保 Cursor Hooks 已配置 sessionStart / sessionEnd。"}
        </EmptyState>
      </div>
    );
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-end gap-3">
        <label className="label cursor-pointer gap-2 p-0">
          <span className="text-sm text-base-content/60">加载子代理会话</span>
          <input
            type="checkbox"
            className="toggle toggle-sm toggle-primary"
            checked={includeSubagents}
            onChange={(e) => {
              const next = e.target.checked;
              writeIncludeSubagents(next);
              setIncludeSubagents(next);
              setPage(1);
            }}
          />
        </label>
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
                    href={`/sessions/${encodeURIComponent(s.session_id)}`}
                    title={s.title?.trim() || s.session_id}
                    className="data-table-link block min-w-0 overflow-hidden"
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      {s.is_subagent ? (
                        <span className="badge badge-ghost badge-sm shrink-0 font-normal">
                          {s.subagent_type ? `子代理·${s.subagent_type}` : "子代理"}
                        </span>
                      ) : null}
                      <span className="min-w-0 flex-1 overflow-hidden">
                        <SessionTitleView
                          title={s.title}
                          domContexts={s.title_dom_contexts}
                          body={s.title_body}
                          fallback={`会话 ${s.session_id?.slice(0, 8)}…`}
                          variant="inline"
                        />
                      </span>
                    </span>
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
