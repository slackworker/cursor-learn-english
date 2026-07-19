"use client";

import Link from "next/link";
import useSWR from "swr";
import { RefreshButton } from "@/components/RefreshButton";
import { SessionTitleView } from "@/components/SessionTitleView";
import { Surface } from "@/components/ui/Surface";
import { LoadingState } from "@/components/ui/EmptyState";
import { formatLocalDateTime } from "@/lib/format-datetime";
import { sessionsSwrOptions } from "@/lib/sessions-swr";

type Session = {
  session_id: string;
  title?: string;
  title_source?: "cursor" | "prompt" | "task";
  title_dom_contexts?: import("@/lib/parse-dom-context").DomContextBlock[];
  title_segments?: import("@/lib/parse-dom-context").PromptSegment[];
  title_body?: string;
  last_activity?: string;
  last_reply?: string;
  start?: string;
  timestamp?: string;
};

type SessionsResponse = {
  sessions: Session[];
  total: number;
};

function recentKey(limit: number): string {
  return `/api/sessions?offset=0&limit=${limit}`;
}

export function RecentSessions({ limit = 5 }: { limit?: number }) {
  const { data, error, isLoading, isValidating, mutate } = useSWR<SessionsResponse>(
    recentKey(limit),
    sessionsSwrOptions
  );
  const sessions = data?.sessions ?? [];
  const total = data?.total ?? 0;

  if (isLoading && sessions.length === 0) {
    return <LoadingState>加载最近会话…</LoadingState>;
  }

  if (error && sessions.length === 0) {
    return (
      <Surface padding="md">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm text-base-content/50">无法加载会话列表</p>
          <RefreshButton onRefresh={() => void mutate()} isValidating={isValidating} />
        </div>
      </Surface>
    );
  }

  if (sessions.length === 0) {
    return (
      <Surface padding="md">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm text-base-content/50">暂无会话，请先配置 Cursor Hooks。</p>
          <RefreshButton onRefresh={() => void mutate()} isValidating={isValidating} />
        </div>
      </Surface>
    );
  }

  return (
    <Surface padding="none" className="flex h-full flex-col">
      <div className="flex items-center justify-between gap-2 border-b border-base-300/50 px-4 py-3 sm:px-5">
        <h3 className="text-sm font-semibold text-base-content">最近会话</h3>
        <div className="flex items-center gap-2">
          <RefreshButton onRefresh={() => void mutate()} isValidating={isValidating} />
          <Link href="/sessions" className="text-xs font-medium text-primary hover:underline">
            全部 {total > 0 ? `(${total})` : ""} →
          </Link>
        </div>
      </div>
      <ul className="divide-y divide-base-300/40">
        {sessions.map((s) => (
          <li key={s.session_id}>
            <Link
              href={`/sessions/${encodeURIComponent(s.session_id)}`}
              className="block px-4 py-3 transition-colors hover:bg-base-200/40 sm:px-5"
            >
              <div className="min-w-0 overflow-hidden text-sm font-medium text-base-content">
                <SessionTitleView
                  title={s.title}
                  segments={s.title_segments}
                  domContexts={s.title_dom_contexts}
                  body={s.title_body}
                  fallback={`会话 ${s.session_id?.slice(0, 8)}…`}
                  variant="inline"
                />
              </div>
              <p className="mt-1 text-[11px] tabular-nums text-base-content/45">
                {formatLocalDateTime(
                  s.last_activity ?? s.last_reply ?? s.start ?? s.timestamp
                )}
              </p>
            </Link>
          </li>
        ))}
      </ul>
    </Surface>
  );
}
