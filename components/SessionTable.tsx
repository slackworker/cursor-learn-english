"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import useSWR from "swr";
import { RefreshButton } from "@/components/RefreshButton";
import { SessionTitleView } from "@/components/SessionTitleView";
import { EmptyState, LoadingState } from "@/components/ui/EmptyState";
import { PageShell } from "@/components/ui/PageShell";
import { Pagination } from "@/components/ui/Pagination";
import { formatLocalDateTime } from "@/lib/format-datetime";
import { sessionsSwrOptions } from "@/lib/sessions-swr";
import type { DomContextBlock, PromptSegment } from "@/lib/parse-dom-context";

type Session = {
  session_id: string;
  title?: string;
  title_source?: "cursor" | "prompt" | "task";
  title_dom_contexts?: DomContextBlock[];
  title_segments?: PromptSegment[];
  title_body?: string;
  prompt_title?: string;
  prompt_title_dom_contexts?: DomContextBlock[];
  prompt_title_segments?: PromptSegment[];
  prompt_title_body?: string;
  timestamp?: string;
  start?: string;
  last_reply?: string;
  last_activity?: string;
  is_subagent?: boolean;
  parent_session_id?: string;
  subagent_type?: string;
  lifecycle_source?: "hooks" | "inferred";
  lifecycle_gaps?: string[];
};

type SessionsResponse = {
  sessions: Session[];
  total: number;
  quality?: {
    inferred_lifecycle?: number;
  };
};

const PAGE_SIZE = 20;
const INCLUDE_SUBAGENTS_STORAGE_KEY = "sessions_include_subagents";
const SHOW_PROMPT_SUBTITLE_STORAGE_KEY = "sessions_show_prompt_subtitle";

function readIncludeSubagents(): boolean {
  if (typeof window === "undefined") return true;
  try {
    const raw = window.localStorage.getItem(INCLUDE_SUBAGENTS_STORAGE_KEY);
    if (raw === null) return true;
    return raw === "1";
  } catch {
    return true;
  }
}

function writeIncludeSubagents(value: boolean): void {
  try {
    window.localStorage.setItem(INCLUDE_SUBAGENTS_STORAGE_KEY, value ? "1" : "0");
  } catch {
    // ignore quota / private mode
  }
}

function readShowPromptSubtitle(): boolean {
  if (typeof window === "undefined") return true;
  try {
    const raw = window.localStorage.getItem(SHOW_PROMPT_SUBTITLE_STORAGE_KEY);
    if (raw === null) return true;
    return raw === "1";
  } catch {
    return true;
  }
}

function writeShowPromptSubtitle(value: boolean): void {
  try {
    window.localStorage.setItem(
      SHOW_PROMPT_SUBTITLE_STORAGE_KEY,
      value ? "1" : "0"
    );
  } catch {
    // ignore quota / private mode
  }
}

function sessionsKey(page: number, includeSubagents: boolean): string {
  const url = new URL(
    "/api/sessions",
    typeof window === "undefined" ? "http://localhost" : window.location.origin
  );
  url.searchParams.set("offset", String((page - 1) * PAGE_SIZE));
  url.searchParams.set("limit", String(PAGE_SIZE));
  if (includeSubagents) url.searchParams.set("includeSubagents", "1");
  return url.pathname + url.search;
}

function hasPromptSubtitle(session: Session): boolean {
  if (session.title_source !== "cursor") return false;
  const prompt =
    session.prompt_title_body?.trim() ||
    session.prompt_title?.trim() ||
    "";
  if (!prompt) return false;
  const primary = session.title?.trim() || "";
  // Avoid a useless second line when Cursor reused the prompt as the name.
  if (primary && prompt.startsWith(primary.replace(/…$/, ""))) return false;
  return true;
}

export function SessionTable() {
  const [page, setPage] = useState(1);
  const [includeSubagents, setIncludeSubagents] = useState(true);
  const [showPromptSubtitle, setShowPromptSubtitle] = useState(true);
  const [prefsReady, setPrefsReady] = useState(false);

  useEffect(() => {
    setIncludeSubagents(readIncludeSubagents());
    setShowPromptSubtitle(readShowPromptSubtitle());
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

  const headerActions = (
    <>
      <label
        className="label cursor-pointer gap-2 p-0"
        title="首行 Cursor 标题，次行首条提问"
      >
        <span className="text-sm text-base-content/60">双行标题</span>
        <input
          type="checkbox"
          className="toggle toggle-sm toggle-primary"
          checked={showPromptSubtitle}
          onChange={(e) => {
            const next = e.target.checked;
            writeShowPromptSubtitle(next);
            setShowPromptSubtitle(next);
          }}
        />
      </label>
      <label className="label cursor-pointer gap-2 p-0" title="加载子代理会话">
        <span className="text-sm text-base-content/60">子代理</span>
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
    </>
  );

  if (showInitialLoading) {
    return (
      <PageShell title="会话列表" actions={headerActions}>
        <LoadingState />
      </PageShell>
    );
  }

  if (loadError && sessions.length === 0) {
    return (
      <PageShell title="会话列表" actions={headerActions}>
        <div className="space-y-3">
          <EmptyState>{loadError}</EmptyState>
        </div>
      </PageShell>
    );
  }

  if (!loadError && !isValidating && sessions.length === 0) {
    return (
      <PageShell title="会话列表" actions={headerActions}>
        <EmptyState>
          {includeSubagents
            ? "暂无会话（含子代理）。请确保已配置 sessionStart/End 与 subagentStart/Stop。"
            : "暂无会话。请确保 Cursor Hooks 已配置 sessionStart / sessionEnd。"}
        </EmptyState>
      </PageShell>
    );
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <PageShell title="会话列表" actions={headerActions}>
      <div className="space-y-3">
        {/* Mobile: stacked list */}
        <div
          className={`data-table-wrap md:hidden ${isValidating && sessions.length > 0 ? "opacity-80 transition-opacity" : ""}`}
        >
          <ul className="session-list">
            {sessions.map((s) => {
              const subtitle = showPromptSubtitle && hasPromptSubtitle(s);
              const tooltip =
                s.title?.trim() ||
                s.prompt_title?.trim() ||
                s.session_id;
              const inferred = s.lifecycle_source === "inferred";
              return (
                <li key={s.session_id}>
                  <Link
                    href={`/sessions/${encodeURIComponent(s.session_id)}`}
                    title={tooltip}
                    className="session-list-item"
                  >
                    <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                      {s.is_subagent ? (
                        <span className="badge badge-ghost badge-sm shrink-0 font-normal">
                          {s.subagent_type
                            ? `Subagent·${s.subagent_type}`
                            : "Subagent"}
                        </span>
                      ) : null}
                      {inferred ? (
                        <span
                          className="badge badge-warning badge-sm shrink-0 font-normal"
                          title={
                            s.lifecycle_gaps?.length
                              ? `缺少: ${s.lifecycle_gaps.join(", ")}`
                              : "缺少 sessionStart，已从 prompt/事件推断"
                          }
                        >
                          推断
                        </span>
                      ) : null}
                      <SessionTitleView
                        title={s.title}
                        segments={s.title_segments}
                        domContexts={s.title_dom_contexts}
                        body={s.title_body}
                        fallback={`会话 ${s.session_id?.slice(0, 8)}…`}
                        variant="inline"
                        className="min-w-0 flex-1 overflow-hidden text-sm font-medium text-base-content"
                      />
                    </div>
                    {subtitle ? (
                      <SessionTitleView
                        title={s.prompt_title}
                        segments={s.prompt_title_segments}
                        domContexts={s.prompt_title_dom_contexts}
                        body={s.prompt_title_body}
                        variant="inline"
                        className="mt-0.5 block min-w-0 overflow-hidden text-xs font-normal text-base-content/50"
                      />
                    ) : null}
                    <p className="session-list-meta">
                      {formatLocalDateTime(
                        s.last_activity ?? s.last_reply ?? s.start ?? s.timestamp
                      )}
                    </p>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>

        {/* Desktop: table */}
        <div
          className={`data-table-wrap hidden md:block ${isValidating && sessions.length > 0 ? "opacity-80 transition-opacity" : ""}`}
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
              {sessions.map((s) => {
                const subtitle = showPromptSubtitle && hasPromptSubtitle(s);
                const tooltip =
                  s.title?.trim() ||
                  s.prompt_title?.trim() ||
                  s.session_id;
                const inferred = s.lifecycle_source === "inferred";
                return (
                  <tr key={s.session_id}>
                    <td className="min-w-0 overflow-hidden">
                      <Link
                        href={`/sessions/${encodeURIComponent(s.session_id)}`}
                        title={tooltip}
                        className="data-table-link block min-w-0 overflow-hidden"
                      >
                        <span className="block min-w-0 overflow-hidden">
                          <span className="flex min-w-0 items-center gap-2">
                            {s.is_subagent ? (
                              <span className="badge badge-ghost badge-sm shrink-0 font-normal">
                                {s.subagent_type
                                  ? `Subagent·${s.subagent_type}`
                                  : "Subagent"}
                              </span>
                            ) : null}
                            {inferred ? (
                              <span
                                className="badge badge-warning badge-sm shrink-0 font-normal"
                                title={
                                  s.lifecycle_gaps?.length
                                    ? `缺少: ${s.lifecycle_gaps.join(", ")}`
                                    : "缺少 sessionStart，已从 prompt/事件推断"
                                }
                              >
                                推断
                              </span>
                            ) : null}
                            <SessionTitleView
                              title={s.title}
                              segments={s.title_segments}
                              domContexts={s.title_dom_contexts}
                              body={s.title_body}
                              fallback={`会话 ${s.session_id?.slice(0, 8)}…`}
                              variant="inline"
                              className="min-w-0 flex-1 overflow-hidden"
                            />
                          </span>
                          {subtitle ? (
                            <SessionTitleView
                              title={s.prompt_title}
                              segments={s.prompt_title_segments}
                              domContexts={s.prompt_title_dom_contexts}
                              body={s.prompt_title_body}
                              variant="inline"
                              className="mt-0.5 block min-w-0 overflow-hidden text-xs font-normal text-base-content/50"
                            />
                          ) : null}
                        </span>
                      </Link>
                    </td>
                    <td className="whitespace-nowrap text-center tabular-nums">
                      {formatLocalDateTime(
                        s.last_activity ?? s.last_reply ?? s.start ?? s.timestamp
                      )}
                    </td>
                  </tr>
                );
              })}
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
    </PageShell>
  );
}
