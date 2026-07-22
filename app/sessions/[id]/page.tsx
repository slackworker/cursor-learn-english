"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import useSWR from "swr";
import { DialogueTimeline } from "@/components/DialogueTimeline";
import { RefreshButton } from "@/components/RefreshButton";
import { SessionTitleView } from "@/components/SessionTitleView";
import { UserPromptView } from "@/components/UserPromptView";
import { LoadingState } from "@/components/ui/EmptyState";
import { MessageBubble } from "@/components/ui/MessageBubble";
import { PageShell } from "@/components/ui/PageShell";
import { Surface } from "@/components/ui/Surface";
import type { DomContextBlock, PromptSegment } from "@/lib/parse-dom-context";
import { formatLocalDateTime, compareTimestamps } from "@/lib/format-datetime";
import { formatDurationMs } from "@/lib/format-duration";
import { fetchJson } from "@/lib/fetch-json";
import { sessionsSwrOptions } from "@/lib/sessions-swr";

type SessionDetail = {
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
  reason?: string;
  duration_ms?: number;
  timestamp?: string;
  start?: string;
  last_activity?: string;
  is_open?: boolean;
  is_subagent?: boolean;
  parent_session_id?: string;
  parent_session_title?: string;
  parent_session_title_dom_contexts?: DomContextBlock[];
  parent_session_title_segments?: PromptSegment[];
  parent_session_title_body?: string;
  subagent_type?: string;
  lifecycle_source?: "hooks" | "inferred";
  lifecycle_gaps?: string[];
  subagents?: Array<{
    session_id: string;
    title?: string;
    title_dom_contexts?: DomContextBlock[];
    title_segments?: PromptSegment[];
    title_body?: string;
    task_description?: string;
    subagent_type?: string;
    start?: string;
    timestamp?: string;
    is_open?: boolean;
  }>;
  prompt_count: number;
  thinking_count: number;
  event_counts: Record<string, number>;
  recent_prompts: Array<{ prompt: string; timestamp: string }>;
  recent_thinking: Array<{ text_preview: string; timestamp: string; model: string }>;
  timeline: Array<{
    event_type: string;
    timestamp: string;
    reason?: string;
    duration_ms?: number;
    tool_name?: string | null;
  }>;
  dialogue_rounds: Array<{
    id: string;
    conversation_id: string;
    prompt: string;
    prompt_timestamp: string;
    response?: {
      text: string;
      timestamp: string;
      model?: string | null;
    };
    thinking: Array<{
      text: string;
      timestamp: string;
      model: string;
      duration_ms: number;
      generation_id: string;
    }>;
    tools: Array<{
      event_type: "postToolUse" | "postToolUseFailure";
      timestamp: string;
      tool_name?: string | null;
      duration?: number;
      failure_type?: string | null;
    }>;
  }>;
  transcript_turns: Array<{
    id: string;
    user_text: string;
    user_prompt: string;
    user_dom_contexts?: Array<{
      domPath: string;
      position: string;
      reactComponent: string;
      htmlElement: string;
    }>;
    user_prompt_segments?: Array<
      | { type: "text"; text: string }
      | {
          type: "dom";
          block: {
            domPath: string;
            position: string;
            reactComponent: string;
            htmlElement: string;
          };
        }
    >;
    user_timestamp?: string;
    assistant_text?: string;
    assistant_segments?: string[];
    assistant_steps?: Array<{
      items: Array<
        | { type: "text"; text: string }
        | { type: "tool_use"; name: string; input: Record<string, unknown> }
      >;
    }>;
    round?: {
      id: string;
      prompt: string;
      prompt_timestamp: string;
      response?: {
        text: string;
        timestamp: string;
        model?: string | null;
      };
      response_segments?: Array<{
        text: string;
        timestamp: string;
        model?: string | null;
      }>;
      thinking: Array<{
        text: string;
        timestamp: string;
        model: string;
        duration_ms: number;
        generation_id: string;
      }>;
      tools: Array<{
        event_type: "postToolUse" | "postToolUseFailure";
        timestamp: string;
        tool_name?: string | null;
        duration?: number;
        failure_type?: string | null;
      }>;
    };
  }>;
};

type SessionDetailResponse = {
  session?: SessionDetail;
};

function resolveTurnModelLabel(
  turn: SessionDetail["transcript_turns"][number]
): string | undefined {
  const round = turn.round;
  if (!round) return undefined;
  const models: string[] = [];
  const seen = new Set<string>();
  const add = (m?: string | null) => {
    if (!m || seen.has(m)) return;
    seen.add(m);
    models.push(m);
  };
  for (const seg of round.response_segments ?? []) add(seg.model);
  add(round.response?.model);
  if (models.length === 0) {
    for (const t of round.thinking ?? []) add(t.model);
  }
  return models.length > 0 ? models.join(" · ") : undefined;
}

async function fetchSessionDetail(url: string): Promise<SessionDetail> {
  const data = await fetchJson<SessionDetailResponse>(url);
  if (!data.session) {
    throw new Error("会话不存在");
  }
  return data.session;
}

export default function SessionDetailPage() {
  const params = useParams<{ id: string }>();
  const sessionId = typeof params?.id === "string" ? params.id : "";
  const {
    data: session,
    error,
    isLoading,
    isValidating,
    mutate,
  } = useSWR<SessionDetail>(
    sessionId ? `/api/sessions/${sessionId}` : null,
    fetchSessionDetail,
    sessionsSwrOptions
  );

  if (isLoading && !session) {
    return (
      <PageShell title="会话详情">
        <LoadingState />
      </PageShell>
    );
  }

  if ((error || !session) && !isValidating) {
    const message =
      error instanceof Error
        ? error.message === "Request failed: 404"
          ? "会话不存在"
          : error.message
        : "会话不存在";
    return (
      <PageShell title="会话详情">
        <div className="flex items-center gap-3">
          <p className="text-sm text-base-content/60">{message}</p>
          <RefreshButton onRefresh={() => void mutate()} isValidating={isValidating} />
        </div>
        <Link href="/sessions" className="back-link mt-4">
          ← 返回会话列表
        </Link>
      </PageShell>
    );
  }

  if (!session) {
    return (
      <PageShell title="会话详情">
        <LoadingState />
      </PageShell>
    );
  }

  const sortedTurns = [...session.transcript_turns].sort((a, b) => {
    const aTs = a.user_timestamp ?? a.round?.prompt_timestamp ?? "";
    const bTs = b.user_timestamp ?? b.round?.prompt_timestamp ?? "";
    return compareTimestamps(aTs, bTs);
  });

  const sortedRounds = [...session.dialogue_rounds].sort((a, b) =>
    compareTimestamps(a.prompt_timestamp, b.prompt_timestamp)
  );
  const hasUnmatchedTurns = sortedTurns.some((turn) => !turn.round);
  const openDebugRounds = sortedTurns.length === 0 || hasUnmatchedTurns;

  return (
    <PageShell
      title={
        <SessionTitleView
          title={session.title}
          segments={session.title_segments}
          domContexts={session.title_dom_contexts}
          body={session.title_body}
          fallback={`会话 ${session.session_id.slice(0, 8)}…`}
          variant="heading"
        />
      }
      description={
        <span className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-xs">{session.session_id}</span>
          {session.is_subagent ? (
            <span className="badge badge-ghost badge-sm font-normal">
              {session.subagent_type
                ? `Subagent·${session.subagent_type}`
                : "Subagent"}
            </span>
          ) : null}
          {session.lifecycle_source === "inferred" ? (
            <span
              className="badge badge-warning badge-sm font-normal"
              title={
                session.lifecycle_gaps?.length
                  ? `缺少: ${session.lifecycle_gaps.join(", ")}`
                  : "缺少生命周期 start 事件"
              }
            >
              推断补全
            </span>
          ) : null}
          {session.is_subagent && session.parent_session_id ? (
            <Link
              href={`/sessions/${encodeURIComponent(session.parent_session_id)}`}
              title={
                session.parent_session_title
                  ? `${session.parent_session_title} (${session.parent_session_id})`
                  : session.parent_session_id
              }
              className="inline-flex min-w-0 max-w-full flex-wrap items-baseline gap-1 text-xs text-base-content/60 underline-offset-2 hover:underline"
            >
              <span className="shrink-0">父会话</span>
              <SessionTitleView
                title={session.parent_session_title}
                segments={session.parent_session_title_segments}
                domContexts={session.parent_session_title_dom_contexts}
                body={session.parent_session_title_body}
                fallback={`会话 ${session.parent_session_id.slice(0, 8)}…`}
                variant="wrap"
                className="min-w-0 font-normal text-base-content/70"
              />
            </Link>
          ) : null}
          {session.subagents && session.subagents.length > 0 ? (
            <span className="flex min-w-0 max-w-full flex-wrap items-baseline gap-x-2 gap-y-1">
              <span className="shrink-0 text-xs text-base-content/60">
                子代理
                {session.subagents.length > 1
                  ? `·${session.subagents.length}`
                  : ""}
              </span>
              {session.subagents.map((sub) => (
                <Link
                  key={sub.session_id}
                  href={`/sessions/${encodeURIComponent(sub.session_id)}`}
                  title={
                    sub.title
                      ? `${sub.subagent_type ? `${sub.subagent_type} · ` : ""}${sub.title} (${sub.session_id})`
                      : sub.session_id
                  }
                  className="inline-flex min-w-0 max-w-full flex-wrap items-baseline gap-1 text-xs text-base-content/60 underline-offset-2 hover:underline"
                >
                  {sub.subagent_type ? (
                    <span className="shrink-0 text-base-content/45">
                      {sub.subagent_type}
                    </span>
                  ) : null}
                  <SessionTitleView
                    title={sub.title}
                    segments={sub.title_segments}
                    domContexts={sub.title_dom_contexts}
                    body={sub.title_body}
                    fallback={`会话 ${sub.session_id.slice(0, 8)}…`}
                    variant="wrap"
                    className="min-w-0 font-normal text-base-content/70"
                  />
                </Link>
              ))}
            </span>
          ) : null}
        </span>
      }
    >
      {session.lifecycle_source === "inferred" ? (
        <div className="banner-warning" role="status">
          <span>
            本会话缺少{" "}
            <code className="text-xs">
              {(session.lifecycle_gaps && session.lifecycle_gaps[0]) ||
                "sessionStart"}
            </code>
            ，列表/详情是用 prompt 与其它事件推断出来的（非完整 Hooks
            生命周期）。调试期请核对 Windows/WSL Hooks 是否漏采。
          </span>
        </div>
      ) : null}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Link href="/sessions" className="back-link">
          ← 返回会话列表
        </Link>
        <div className="flex items-center gap-2">
          <RefreshButton onRefresh={() => void mutate()} isValidating={isValidating} />
        </div>
      </div>

      {sortedTurns.length > 0 ? (
        <section className="mt-6">
          <h2 className="section-title">对话流</h2>
          <Surface padding="none">
            <ul className="dialogue-list">
              {sortedTurns.map((turn) => {
                const timeLabel = formatLocalDateTime(
                  turn.user_timestamp ?? turn.round?.prompt_timestamp
                );
                const modelLabel = resolveTurnModelLabel(turn);
                return (
                <li key={turn.id} className="dialogue-item">
                  {(timeLabel || modelLabel) && (
                    <div className="dialogue-item-meta">
                      {timeLabel}
                      {modelLabel ? ` · ${modelLabel}` : ""}
                    </div>
                  )}
                  <MessageBubble variant="user" label="用户提示词">
                    <UserPromptView
                      prompt={
                        turn.user_prompt ||
                        turn.round?.prompt ||
                        turn.user_text
                      }
                      segments={turn.user_prompt_segments}
                      domContexts={turn.user_dom_contexts}
                      ttsId={`turn-${turn.id}-user`}
                    />
                  </MessageBubble>
                  <div className="mt-3">
                    <MessageBubble variant="assistant" label="Cursor回复">
                      <DialogueTimeline
                        round={turn.round}
                        transcriptSteps={turn.assistant_steps}
                        subagents={session.subagents}
                        transcriptSegments={
                          turn.assistant_steps?.length
                            ? undefined
                            : turn.assistant_segments ??
                              (turn.assistant_text ? [turn.assistant_text] : undefined)
                        }
                      />
                    </MessageBubble>
                  </div>
                </li>
                );
              })}
            </ul>
          </Surface>
        </section>
      ) : (
        <Surface className="mt-6">
          <p className="text-sm text-base-content/50">暂无 transcript 对话数据，下面展示事件聚合轮次。</p>
        </Surface>
      )}

      <p className="mt-6 text-xs text-base-content/45">
        开始 {formatLocalDateTime(session.start)}
        {" · "}
        结束 {session.is_open ? "进行中" : formatLocalDateTime(session.timestamp)}
        {" · "}
        时长 {formatDurationMs(session.duration_ms)}
        {session.is_open ? "（至最近活跃）" : ""}
        {" · "}
        {session.reason ?? "—"}
      </p>

      <section className="mt-4">
        <details
          open={openDebugRounds}
          className="surface p-4"
        >
          <summary className="cursor-pointer text-sm font-medium text-base-content/60">
            事件聚合轮次（调试）
          </summary>
          <div className="mt-3">
            {sortedRounds.length === 0 ? (
              <p className="text-sm text-base-content/50">暂无可匹配轮次</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {sortedRounds.map((round) => (
                  <li key={round.id} className="rounded-lg border border-base-300/60 bg-base-200/30 p-3">
                    <div className="font-mono text-xs text-base-content/45">
                      {formatLocalDateTime(round.prompt_timestamp)}
                    </div>
                    <div className="mt-1 text-base-content/70">
                      thinking: {round.thinking.length} · tools: {round.tools.length} · response: {round.response ? "yes" : "no"}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </details>
      </section>
    </PageShell>
  );
}
