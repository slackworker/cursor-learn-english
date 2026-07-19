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
import { formatLocalDateTime } from "@/lib/format-datetime";
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
  subagent_type?: string;
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
    return aTs.localeCompare(bTs);
  });

  const sortedRounds = [...session.dialogue_rounds].sort((a, b) =>
    a.prompt_timestamp.localeCompare(b.prompt_timestamp)
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
              {session.subagent_type ? `子代理·${session.subagent_type}` : "子代理"}
            </span>
          ) : null}
          {session.is_subagent && session.parent_session_id ? (
            <Link
              href={`/sessions/${encodeURIComponent(session.parent_session_id)}`}
              className="text-xs text-base-content/60 underline-offset-2 hover:underline"
            >
              父会话 {session.parent_session_id.slice(0, 8)}…
            </Link>
          ) : null}
        </span>
      }
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Link href="/sessions" className="back-link">
          ← 返回会话列表
        </Link>
        <div className="flex items-center gap-2">
          <RefreshButton onRefresh={() => void mutate()} isValidating={isValidating} />
        </div>
      </div>

      <section className="meta-grid mt-2">
        {[
          { label: "开始时间", value: formatLocalDateTime(session.start) },
          {
            label: "结束时间",
            value: session.is_open ? "进行中" : formatLocalDateTime(session.timestamp),
          },
          {
            label: "会话时长",
            value: (
              <>
                {formatDurationMs(session.duration_ms)}
                {session.is_open ? (
                  <span className="mt-0.5 block text-xs text-base-content/40">自开始至最近活跃</span>
                ) : null}
              </>
            ),
          },
          { label: "结束原因", value: session.reason ?? "—" },
        ].map((item) => (
          <Surface key={item.label} className="meta-card" padding="md">
            <p className="meta-card-label">{item.label}</p>
            <div className="meta-card-value">{item.value}</div>
          </Surface>
        ))}
      </section>

      {sortedTurns.length > 0 ? (
        <section className="mt-8">
          <h2 className="section-title">对话流</h2>
          <Surface padding="none">
            <ul className="dialogue-list">
              {sortedTurns.map((turn) => (
                <li key={turn.id} className="dialogue-item">
                  <div className="dialogue-item-meta">
                    {formatLocalDateTime(turn.user_timestamp ?? turn.round?.prompt_timestamp)}
                  </div>
                  <MessageBubble variant="user" label="用户提示词">
                    <UserPromptView
                      prompt={
                        turn.user_prompt ||
                        turn.round?.prompt ||
                        turn.user_text
                      }
                      segments={turn.user_prompt_segments}
                      domContexts={turn.user_dom_contexts}
                    />
                  </MessageBubble>
                  <div className="mt-3">
                    <MessageBubble variant="assistant" label="Cursor回复">
                      <DialogueTimeline
                        round={turn.round}
                        transcriptSteps={turn.assistant_steps}
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
              ))}
            </ul>
          </Surface>
        </section>
      ) : (
        <Surface className="mt-8">
          <p className="text-sm text-base-content/50">暂无 transcript 对话数据，下面展示事件聚合轮次。</p>
        </Surface>
      )}

      <section className="mt-6">
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
