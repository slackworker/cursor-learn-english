"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

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

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <Link href="/sessions" className="mb-4 inline-block text-sm text-blue-600 hover:underline dark:text-blue-400">
        ← 返回会话列表
      </Link>
      <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100">{session.title || `会话 ${session.session_id.slice(0, 8)}…`}</h1>
      <p className="mt-1 font-mono text-xs text-zinc-500 dark:text-zinc-400">{session.session_id}</p>

      <section className="mt-6 grid gap-3 md:grid-cols-4">
        <div className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-700 dark:bg-zinc-900">
          <p className="text-xs text-zinc-500 dark:text-zinc-400">开始时间</p>
          <p className="mt-1 text-sm text-zinc-700 dark:text-zinc-300">{session.start ? session.start.slice(0, 19).replace("T", " ") : "—"}</p>
        </div>
        <div className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-700 dark:bg-zinc-900">
          <p className="text-xs text-zinc-500 dark:text-zinc-400">结束时间</p>
          <p className="mt-1 text-sm text-zinc-700 dark:text-zinc-300">{session.timestamp ? session.timestamp.slice(0, 19).replace("T", " ") : "—"}</p>
        </div>
        <div className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-700 dark:bg-zinc-900">
          <p className="text-xs text-zinc-500 dark:text-zinc-400">会话时长</p>
          <p className="mt-1 text-sm text-zinc-700 dark:text-zinc-300">{formatMs(session.duration_ms)}</p>
        </div>
        <div className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-700 dark:bg-zinc-900">
          <p className="text-xs text-zinc-500 dark:text-zinc-400">结束原因</p>
          <p className="mt-1 text-sm text-zinc-700 dark:text-zinc-300">{session.reason ?? "—"}</p>
        </div>
      </section>

      <section className="mt-6 grid gap-3 md:grid-cols-3">
        <div className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-700 dark:bg-zinc-900">
          <p className="text-xs text-zinc-500 dark:text-zinc-400">Prompt 数</p>
          <p className="mt-1 text-lg font-semibold text-zinc-800 dark:text-zinc-100">{session.prompt_count}</p>
        </div>
        <div className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-700 dark:bg-zinc-900">
          <p className="text-xs text-zinc-500 dark:text-zinc-400">Thinking 数</p>
          <p className="mt-1 text-lg font-semibold text-zinc-800 dark:text-zinc-100">{session.thinking_count}</p>
        </div>
        <div className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-700 dark:bg-zinc-900">
          <p className="text-xs text-zinc-500 dark:text-zinc-400">事件类型数</p>
          <p className="mt-1 text-lg font-semibold text-zinc-800 dark:text-zinc-100">
            {Object.keys(session.event_counts).filter((k) => !k.startsWith("_")).length}
          </p>
        </div>
      </section>

      <section className="mt-6 rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-700 dark:bg-zinc-900">
        <h2 className="mb-3 text-sm font-medium text-zinc-700 dark:text-zinc-300">完整对话轮次（Transcript 优先）</h2>
        {session.transcript_turns.length === 0 ? (
          <p className="text-sm text-zinc-500 dark:text-zinc-400">暂无 transcript 对话数据</p>
        ) : (
          <ul className="space-y-3 text-sm">
            {session.transcript_turns.map((r) => (
              <li key={r.id} className="rounded border border-zinc-100 p-3 dark:border-zinc-800">
                {r.user_timestamp ? (
                  <div className="font-mono text-xs text-zinc-500 dark:text-zinc-400">{r.user_timestamp}</div>
                ) : null}
                <div className="mt-2 rounded bg-zinc-50 p-2 dark:bg-zinc-800/60">
                  <div className="mb-1 text-xs font-semibold text-zinc-500 dark:text-zinc-300">用户</div>
                  <div className="whitespace-pre-wrap text-zinc-800 dark:text-zinc-100">{r.user_text}</div>
                </div>
                <div className="mt-2 rounded bg-blue-50 p-2 dark:bg-blue-950/30">
                  <div className="mb-1 text-xs font-semibold text-zinc-500 dark:text-zinc-300">助手</div>
                  <div className="whitespace-pre-wrap text-zinc-800 dark:text-zinc-100">{r.assistant_text ?? "（该轮尚无助手文本）"}</div>
                </div>
                <div className="mt-2 rounded border border-zinc-200 p-2 dark:border-zinc-700">
                  <div className="text-xs font-semibold text-zinc-500 dark:text-zinc-300">Thinking / Tools</div>
                  <div className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                    thinking: {r.round?.thinking.length ?? 0} · tools: {r.round?.tools.length ?? 0}
                  </div>
                  {(r.round?.thinking.length ?? 0) > 0 ? (
                    <ul className="mt-2 space-y-1">
                      {r.round!.thinking.slice(0, 2).map((t) => (
                        <li key={`${t.generation_id}-${t.timestamp}`} className="rounded bg-zinc-50 p-2 text-xs text-zinc-600 dark:bg-zinc-800/40 dark:text-zinc-300">
                          {t.text.slice(0, 160)}
                          {t.text.length > 160 ? "…" : ""}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                  {(r.round?.tools.length ?? 0) > 0 ? (
                    <ul className="mt-2 space-y-1">
                      {r.round!.tools.slice(0, 4).map((tool, idx) => (
                        <li key={`${tool.timestamp}-${idx}`} className="text-xs text-zinc-600 dark:text-zinc-300">
                          {tool.event_type} · {tool.tool_name || "unknown"}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-6 rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-700 dark:bg-zinc-900">
        <h2 className="mb-3 text-sm font-medium text-zinc-700 dark:text-zinc-300">事件聚合轮次（用于核对 thinking/tools）</h2>
        {session.dialogue_rounds.length === 0 ? (
          <p className="text-sm text-zinc-500 dark:text-zinc-400">暂无可匹配轮次</p>
        ) : (
          <ul className="space-y-2 text-sm">
            {session.dialogue_rounds.map((r) => (
              <li key={r.id} className="rounded border border-zinc-100 p-2 dark:border-zinc-800">
                <div className="font-mono text-xs text-zinc-500 dark:text-zinc-400">{r.prompt_timestamp.slice(0, 19).replace("T", " ")}</div>
                <div className="mt-1 text-zinc-700 dark:text-zinc-200">thinking: {r.thinking.length} · tools: {r.tools.length} · response: {r.response ? "yes" : "no"}</div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-6 rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-700 dark:bg-zinc-900">
        <h2 className="mb-3 text-sm font-medium text-zinc-700 dark:text-zinc-300">最近 Prompts</h2>
        {session.recent_prompts.length === 0 ? (
          <p className="text-sm text-zinc-500 dark:text-zinc-400">暂无</p>
        ) : (
          <ul className="space-y-2 text-sm">
            {session.recent_prompts.map((p) => (
              <li key={`${p.timestamp}-${p.prompt.slice(0, 12)}`} className="rounded border border-zinc-100 p-2 dark:border-zinc-800">
                <div className="text-zinc-700 dark:text-zinc-200">{p.prompt}</div>
                <div className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">{p.timestamp.slice(0, 19).replace("T", " ")}</div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-6 rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-700 dark:bg-zinc-900">
        <h2 className="mb-3 text-sm font-medium text-zinc-700 dark:text-zinc-300">最近事件时间线</h2>
        {session.timeline.length === 0 ? (
          <p className="text-sm text-zinc-500 dark:text-zinc-400">暂无</p>
        ) : (
          <ul className="space-y-2 text-sm">
            {session.timeline.map((t) => (
              <li key={`${t.event_type}-${t.timestamp}`} className="rounded border border-zinc-100 p-2 dark:border-zinc-800">
                <div className="font-mono text-xs text-zinc-500 dark:text-zinc-400">{t.timestamp.slice(0, 19).replace("T", " ")}</div>
                <div className="mt-1 text-zinc-700 dark:text-zinc-200">
                  {t.event_type}
                  {t.tool_name ? ` · ${t.tool_name}` : ""}
                  {t.reason ? ` · ${t.reason}` : ""}
                  {typeof t.duration_ms === "number" ? ` · ${formatMs(t.duration_ms)}` : ""}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
