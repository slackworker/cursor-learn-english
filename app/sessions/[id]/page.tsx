"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { MarkdownContent } from "@/components/MarkdownContent";
import { DialogueTimeline } from "@/components/DialogueTimeline";

type SessionDetail = {
  session_id: string;
  title?: string;
  reason?: string;
  duration_ms?: number;
  timestamp?: string;
  start?: string;
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

function formatMs(ms?: number) {
  if (ms == null) return "—";
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)}min`;
}

function formatDateTime(value?: string) {
  if (!value) return "—";
  // 仅对 ISO 8601（如 2026-06-02T10:45:00）做 T 替换；transcript 的
  // <timestamp>Tuesday, Jun 2, …</timestamp> 含字母 T，不能用 replace("T")
  if (/^\d{4}-\d{2}-\d{2}T/.test(value)) {
    return value.slice(0, 19).replace("T", " ");
  }
  return value;
}

export default function SessionDetailPage() {
  const params = useParams<{ id: string }>();
  const sessionId = typeof params?.id === "string" ? params.id : "";
  const [session, setSession] = useState<SessionDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let canceled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        if (!sessionId) throw new Error("会话 ID 无效");
        const res = await fetch(`/api/sessions/${sessionId}`);
        if (!res.ok) {
          throw new Error(res.status === 404 ? "会话不存在" : "加载失败");
        }
        const data = (await res.json()) as { session?: SessionDetail };
        if (!canceled) setSession(data.session ?? null);
      } catch (e) {
        if (!canceled) setError(e instanceof Error ? e.message : "加载失败");
      } finally {
        if (!canceled) setLoading(false);
      }
    }

    load();
    return () => {
      canceled = true;
    };
  }, [sessionId]);

  if (loading) {
    return <main className="mx-auto max-w-6xl px-4 py-8">加载中…</main>;
  }

  if (error || !session) {
    return (
      <main className="mx-auto max-w-6xl px-4 py-8">
        <p className="text-zinc-600 dark:text-zinc-300">{error ?? "会话不存在"}</p>
        <Link href="/sessions" className="mt-3 inline-block text-blue-600 hover:underline dark:text-blue-400">
          返回会话列表
        </Link>
      </main>
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
    <main className="mx-auto max-w-6xl px-4 py-8">
      <Link href="/sessions" className="mb-4 inline-block text-sm text-blue-600 hover:underline dark:text-blue-400">
        ← 返回会话列表
      </Link>
      <h1 className="text-2xl font-semibold">{session.title || `会话 ${session.session_id.slice(0, 8)}…`}</h1>
      <p className="mt-1 font-mono text-xs opacity-60">{session.session_id}</p>

      <section className="mt-6 grid gap-3 md:grid-cols-4">
        <div className="card bg-base-200 p-4">
          <p className="text-xs opacity-60">开始时间</p>
          <p className="mt-1 text-sm">{formatDateTime(session.start)}</p>
        </div>
        <div className="card bg-base-200 p-4">
          <p className="text-xs opacity-60">结束时间</p>
          <p className="mt-1 text-sm">{formatDateTime(session.timestamp)}</p>
        </div>
        <div className="card bg-base-200 p-4">
          <p className="text-xs opacity-60">会话时长</p>
          <p className="mt-1 text-sm">{formatMs(session.duration_ms)}</p>
        </div>
        <div className="card bg-base-200 p-4">
          <p className="text-xs opacity-60">结束原因</p>
          <p className="mt-1 text-sm">{session.reason ?? "—"}</p>
        </div>
      </section>

      {sortedTurns.length > 0 ? (
        <section className="mt-6">
          <h2 className="mb-3 text-sm font-medium opacity-70">
            对话流（按 session_id 分组，时间从上到下）
          </h2>
          <div className="card bg-base-200">
            <ul className="divide-y divide-base-300">
              {sortedTurns.map((turn) => (
                <li key={turn.id} className="p-4">
                  <div className="mb-2 text-[11px] opacity-70">
                    {formatDateTime(turn.user_timestamp ?? turn.round?.prompt_timestamp)}
                  </div>
                  <div className="rounded-lg border border-info/30 bg-info/10 p-3 mb-3">
                    <div className="mb-1 text-xs font-medium text-info">用户问题</div>
                    <MarkdownContent className="whitespace-pre-wrap break-words text-sm">
                      {turn.round?.prompt || turn.user_prompt || turn.user_text}
                    </MarkdownContent>
                  </div>
                  <div className="rounded-lg border border-success/30 bg-success/10 p-3">
                    <div className="mb-2 text-xs font-medium text-success">助手回复与推理过程</div>
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
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </section>
      ) : (
        <section className="mt-6 card bg-base-200 p-4">
          <p className="text-sm opacity-60">暂无 transcript 对话数据，下面展示事件聚合轮次。</p>
        </section>
      )}

      <section className="mt-6">
        <details
          open={openDebugRounds}
          className="rounded-lg border border-base-300 bg-base-100 p-4"
        >
          <summary className="cursor-pointer text-sm font-medium opacity-70">
            事件聚合轮次（调试）
          </summary>
          <div className="mt-3">
            {sortedRounds.length === 0 ? (
              <p className="text-sm opacity-60">暂无可匹配轮次</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {sortedRounds.map((round) => (
                  <li key={round.id} className="rounded border border-base-300 p-2">
                    <div className="font-mono text-xs opacity-60">
                      {formatDateTime(round.prompt_timestamp)}
                    </div>
                    <div className="mt-1">
                      thinking: {round.thinking.length} · tools: {round.tools.length} · response: {round.response ? "yes" : "no"}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </details>
      </section>
    </main>
  );
}
