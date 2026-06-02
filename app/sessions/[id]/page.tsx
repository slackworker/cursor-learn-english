"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

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
    round?: {
      id: string;
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
  return value.slice(0, 19).replace("T", " ");
}

const markdownComponents = {
  p: ({ children }: { children?: React.ReactNode }) => (
    <p className="mb-2 last:mb-0">{children}</p>
  ),
  ul: ({ children }: { children?: React.ReactNode }) => (
    <ul className="mb-2 list-disc space-y-0.5 pl-5">{children}</ul>
  ),
  ol: ({ children }: { children?: React.ReactNode }) => (
    <ol className="mb-2 list-decimal space-y-0.5 pl-5">{children}</ol>
  ),
  li: ({ children }: { children?: React.ReactNode }) => (
    <li className="leading-relaxed">{children}</li>
  ),
  code: ({ children }: { children?: React.ReactNode }) => (
    <code className="rounded bg-base-300 px-1.5 py-0.5 text-sm">{children}</code>
  ),
  pre: ({ children }: { children?: React.ReactNode }) => (
    <pre className="mb-2 overflow-x-auto rounded bg-base-300 p-3 text-sm">{children}</pre>
  ),
  blockquote: ({ children }: { children?: React.ReactNode }) => (
    <blockquote className="border-l-2 border-base-300 pl-3 opacity-70">
      {children}
    </blockquote>
  ),
};

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
                    <div className="break-words text-sm">
                      <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
                        {turn.user_text}
                      </ReactMarkdown>
                    </div>
                  </div>
                  <div className="rounded-lg border border-success/30 bg-success/10 p-3 mb-3">
                    <div className="mb-1 text-xs font-medium text-success">助手回复</div>
                    {(turn.assistant_segments?.length ?? 0) > 0 ? (
                      <div className="space-y-3">
                        {turn.assistant_segments!.map((segment, idx) => (
                          <div key={`${turn.id}-assistant-${idx}`} className={idx > 0 ? "border-t border-success/20 pt-3" : ""}>
                            <div className="break-words text-sm">
                              <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
                                {segment}
                              </ReactMarkdown>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : turn.assistant_text ? (
                      <div className="break-words text-sm">
                        <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
                          {turn.assistant_text}
                        </ReactMarkdown>
                      </div>
                    ) : (
                      <p className="text-sm opacity-60">（该轮暂无助手文本）</p>
                    )}
                  </div>
                  <div className="rounded-lg border border-base-300 bg-base-100 p-3">
                    <div className="text-xs font-medium opacity-70">
                      Thinking / Tools · thinking: {turn.round?.thinking.length ?? 0} · tools: {turn.round?.tools.length ?? 0}
                    </div>
                    {(turn.round?.thinking.length ?? 0) > 0 ? (
                      <div className="mt-2 space-y-2">
                        {turn.round!.thinking.map((t) => (
                          <details key={`${t.generation_id}-${t.timestamp}`} className="collapse collapse-arrow border border-base-300 bg-base-100">
                            <summary className="collapse-title min-h-0 py-2 text-xs font-medium">
                              {formatDateTime(t.timestamp)} · {t.model} · {t.duration_ms}ms
                            </summary>
                            <div className="collapse-content pt-1 text-sm">
                              <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
                                {t.text}
                              </ReactMarkdown>
                            </div>
                          </details>
                        ))}
                      </div>
                    ) : null}
                    {(turn.round?.tools.length ?? 0) > 0 ? (
                      <ul className="mt-2 space-y-1 text-xs opacity-80">
                        {turn.round!.tools.map((tool, idx) => (
                          <li key={`${tool.timestamp}-${idx}`}>
                            {tool.timestamp.slice(11, 19)} · {tool.tool_name || "unknown"} · {tool.event_type}
                            {tool.duration ? ` · ${tool.duration}ms` : ""}
                            {tool.failure_type ? ` · ${tool.failure_type}` : ""}
                          </li>
                        ))}
                      </ul>
                    ) : null}
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

      <section className="mt-6 rounded-lg border border-base-300 bg-base-100 p-4">
        <h2 className="mb-3 text-sm font-medium opacity-70">事件聚合轮次（兜底）</h2>
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
      </section>
    </main>
  );
}
