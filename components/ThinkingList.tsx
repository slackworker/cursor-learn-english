"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useSearchParams } from "next/navigation";

type ThinkingRecord = {
  text: string;
  timestamp: string;
  model: string;
  generation_id: string;
  duration_ms: number;
};

type ToolRecord = {
  event_type: "postToolUse" | "postToolUseFailure";
  timestamp: string;
  tool_name?: string | null;
  duration?: number;
  failure_type?: string | null;
};

type DialogueRound = {
  id: string;
  conversation_id: string;
  prompt: string;
  prompt_timestamp: string;
  response?: {
    text: string;
    timestamp: string;
    model?: string | null;
  };
  thinking: ThinkingRecord[];
  tools: ToolRecord[];
};

function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function applyHighlightMarkdown(text: string, highlight: string): string {
  if (!highlight) return text;
  const pattern = new RegExp(`(${escapeRegExp(highlight)})`, "gi");
  return text.replace(pattern, "**$1**");
}

function stripMarkdownForTTS(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, "")       // fenced code blocks
    .replace(/^#{1,6}\s+/gm, "")          // headings
    .replace(/\*\*([^*]+)\*\*/g, "$1")    // bold
    .replace(/\*([^*]+)\*/g, "$1")        // italic
    .replace(/__([^_]+)__/g, "$1")        // bold alt
    .replace(/_([^_]+)_/g, "$1")          // italic alt
    .replace(/`([^`]+)`/g, "$1")          // inline code
    .replace(/~~([^~]+)~~/g, "$1")        // strikethrough
    .replace(/^\s*[-*+]\s+/gm, "")        // unordered list markers
    .replace(/^\s*\d+\.\s+/gm, "")        // ordered list markers
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1") // links & images
    .replace(/^\s*>\s?/gm, "")            // blockquote markers
    .replace(/\n{2,}/g, "\n")
    .trim();
}

function useTTS() {
  const [speakingId, setSpeakingId] = useState<string | null>(null);
  const utterRef = useRef<SpeechSynthesisUtterance | null>(null);

  const stop = useCallback(() => {
    window.speechSynthesis.cancel();
    setSpeakingId(null);
    utterRef.current = null;
  }, []);

  const speak = useCallback((id: string, text: string) => {
    if (speakingId === id) {
      stop();
      return;
    }
    window.speechSynthesis.cancel();

    const plain = stripMarkdownForTTS(text);
    const utter = new SpeechSynthesisUtterance(plain);
    utter.lang = "en-US";
    utter.onend = () => setSpeakingId(null);
    utter.onerror = () => setSpeakingId(null);

    utterRef.current = utter;
    setSpeakingId(id);
    window.speechSynthesis.speak(utter);
  }, [speakingId, stop]);

  useEffect(() => {
    return () => { window.speechSynthesis.cancel(); };
  }, []);

  return { speakingId, speak, stop };
}

const markdownComponents = {
  p: ({ children }: { children?: React.ReactNode }) => <p className="mb-2 last:mb-0">{children}</p>,
  ul: ({ children }: { children?: React.ReactNode }) => <ul className="list-disc pl-5 mb-2 space-y-0.5">{children}</ul>,
  ol: ({ children }: { children?: React.ReactNode }) => <ol className="list-decimal pl-5 mb-2 space-y-0.5">{children}</ol>,
  li: ({ children }: { children?: React.ReactNode }) => <li className="leading-relaxed">{children}</li>,
  code: ({ children }: { children?: React.ReactNode }) => (
    <code className="rounded bg-base-300 px-1.5 py-0.5 text-sm">{children}</code>
  ),
  pre: ({ children }: { children?: React.ReactNode }) => (
    <pre className="mb-2 overflow-x-auto rounded bg-base-300 p-3 text-sm">{children}</pre>
  ),
  strong: ({ children }: { children?: React.ReactNode }) => <strong className="font-semibold text-primary">{children}</strong>,
  a: ({ href, children }: { href?: string; children?: React.ReactNode }) => (
    <a href={href} target="_blank" rel="noopener noreferrer" className="link link-primary">
      {children}
    </a>
  ),
  h1: ({ children }: { children?: React.ReactNode }) => <h1 className="mb-2 mt-3 text-lg font-semibold">{children}</h1>,
  h2: ({ children }: { children?: React.ReactNode }) => <h2 className="mb-2 mt-3 text-base font-semibold">{children}</h2>,
  h3: ({ children }: { children?: React.ReactNode }) => <h3 className="mb-1 mt-2 text-sm font-semibold">{children}</h3>,
  blockquote: ({ children }: { children?: React.ReactNode }) => (
    <blockquote className="border-l-2 border-base-300 pl-3 opacity-70">
      {children}
    </blockquote>
  ),
};

function thinkingTitle(record: ThinkingRecord, index: number): string {
  const time = record.timestamp.slice(0, 19).replace("T", " ");
  return `#${index + 1} ${time} · ${record.model} · ${record.duration_ms}ms`;
}

function PlayButton({ playing, onClick }: { playing: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      aria-label={playing ? "停止朗读" : "朗读英语"}
      className="btn btn-circle btn-ghost btn-sm"
    >
      {playing ? (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4">
          <path fillRule="evenodd" d="M4.5 7.5a3 3 0 0 1 3-3h9a3 3 0 0 1 3 3v9a3 3 0 0 1-3 3h-9a3 3 0 0 1-3-3v-9Z" clipRule="evenodd" />
        </svg>
      ) : (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4">
          <path fillRule="evenodd" d="M4.5 5.653c0-1.427 1.529-2.33 2.779-1.643l11.54 6.347c1.295.712 1.295 2.573 0 3.286L7.28 19.99c-1.25.687-2.779-.217-2.779-1.643V5.653Z" clipRule="evenodd" />
        </svg>
      )}
    </button>
  );
}

function ThinkingItem({
  record,
  index,
  accordionName,
  defaultOpen,
  playing,
  onTogglePlay,
  highlight,
}: {
  record: ThinkingRecord;
  index: number;
  accordionName: string;
  defaultOpen: boolean;
  playing: boolean;
  onTogglePlay: () => void;
  highlight: string;
}) {
  return (
    <div className="collapse collapse-arrow bg-base-100 border border-base-300">
      <input
        type="radio"
        name={accordionName}
        defaultChecked={defaultOpen}
      />
      <div className="collapse-title font-semibold min-h-0 py-2 text-sm">
        {thinkingTitle(record, index)}
      </div>
      <div className="collapse-content relative text-sm pr-12">
        <div className="pt-1 break-words">
          <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
            {applyHighlightMarkdown(record.text, highlight)}
          </ReactMarkdown>
        </div>
        <div className="absolute right-2 top-1/2 -translate-y-1/2">
          <div className="tooltip tooltip-left" data-tip="点击朗读英语">
            <PlayButton playing={playing} onClick={onTogglePlay} />
          </div>
        </div>
      </div>
    </div>
  );
}

function RoundCard({
  round,
  roundIndex,
  speakingId,
  onSpeak,
  highlight,
}: {
  round: DialogueRound;
  roundIndex: number;
  speakingId: string | null;
  onSpeak: (id: string, text: string) => void;
  highlight: string;
}) {
  const accordionName = `thinking-accordion-${roundIndex}`;
  const [showFullPrompt, setShowFullPrompt] = useState(false);
  const prompt = round.prompt ?? "";
  const isLongPrompt = prompt.length > 200;
  const promptDisplay = applyHighlightMarkdown(
    showFullPrompt || !isLongPrompt ? prompt : `${prompt.slice(0, 200)}...`,
    highlight
  );
  const responseText = round.response?.text ? applyHighlightMarkdown(round.response.text, highlight) : "";

  return (
    <li className="p-4">
      <div className="rounded-lg border border-info/30 bg-info/10 p-3 mb-3">
        <div className="mb-1 flex items-center justify-between gap-2">
          <span className="block text-xs font-medium text-info">用户问题</span>
          {isLongPrompt && (
            <button
              type="button"
              className="btn btn-ghost btn-xs px-1 text-[11px]"
              onClick={() => setShowFullPrompt((v) => !v)}
            >
              {showFullPrompt ? "收起" : "展开"}
            </button>
          )}
        </div>
        <div className="whitespace-pre-wrap break-words text-sm">
          <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
            {promptDisplay}
          </ReactMarkdown>
        </div>
      </div>

      <div className="rounded-lg border border-success/30 bg-success/10 p-3 mb-3">
        <div className="mb-1 flex items-center justify-between gap-2">
          <span className="block text-xs font-medium text-success">助手回复</span>
          {round.response?.timestamp ? (
            <span className="text-[11px] opacity-70">
              {round.response.timestamp.slice(0, 19).replace("T", " ")}
              {round.response.model ? ` · ${round.response.model}` : ""}
            </span>
          ) : null}
        </div>
        {round.response?.text ? (
          <div className="break-words text-sm">
            <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
              {responseText}
            </ReactMarkdown>
          </div>
        ) : (
          <p className="text-sm opacity-60">未采集到该轮助手完整回复（请更新 hooks 后重试）。</p>
        )}
      </div>

      <div className="mb-2 text-[11px] opacity-70">
        会话：<span className="font-mono">{round.conversation_id}</span>
      </div>

      {round.tools.length > 0 && (
        <div className="rounded-lg border border-warning/30 bg-warning/10 p-3 mb-3">
          <div className="mb-1 text-xs font-medium text-warning">工具调用轨迹（{round.tools.length}）</div>
          <ul className="space-y-1 text-xs">
            {round.tools.map((tool, idx) => (
              <li key={`${tool.timestamp}-${idx}`} className="opacity-80">
                {tool.timestamp.slice(11, 19)} · {tool.tool_name || "unknown"} · {tool.event_type}
                {tool.duration ? ` · ${tool.duration}ms` : ""}
                {tool.failure_type ? ` · ${tool.failure_type}` : ""}
              </li>
            ))}
          </ul>
        </div>
      )}

      <span className="mb-2 block text-xs font-medium text-success">
        Thinking ({round.thinking.length} 条)
      </span>
      <div className="space-y-2">
        {round.thinking.map((r, i) => {
          const itemId = `${r.generation_id}-${i}`;
          return (
            <ThinkingItem
              key={itemId}
              record={r}
              index={i}
              accordionName={accordionName}
              defaultOpen={false}
              playing={speakingId === itemId}
              onTogglePlay={() => onSpeak(itemId, r.text)}
              highlight={highlight}
            />
          );
        })}
      </div>
    </li>
  );
}

export function ThinkingList() {
  const [rounds, setRounds] = useState<DialogueRound[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [isLoaded, setIsLoaded] = useState(false);
  const pageSize = 10;
  const { speakingId, speak } = useTTS();
  const searchParams = useSearchParams();
  const highlight = searchParams.get("highlight")?.toLowerCase().trim() || "";

  useEffect(() => {
    const url = new URL("/api/dialogues", window.location.origin);
    url.searchParams.set("page", String(page));
    url.searchParams.set("pageSize", String(pageSize));
    if (highlight) {
      url.searchParams.set("highlight", highlight);
    }
    fetch(url.toString())
      .then((r) => r.json())
      .then((res) => {
        setRounds(res.rounds ?? []);
        setTotal(res.total ?? 0);
      })
      .catch(() => setRounds([]))
      .finally(() => setIsLoaded(true));
  }, [page, highlight]);

  if (!isLoaded && rounds.length === 0) {
    return <div className="card bg-base-200 p-6"><span className="loading loading-spinner loading-sm"></span> 加载中…</div>;
  }

  if (rounds.length === 0) {
    return (
      <div className="card bg-base-200 p-6">
        <p className="opacity-60">暂无完整轮次记录。请先在更新后的 Hooks 配置下继续对话生成数据。</p>
      </div>
    );
  }

  const totalPages = Math.ceil(total / pageSize);

  return (
    <div className="space-y-4">
      {highlight && (
        <div className="alert alert-info flex items-center justify-between text-sm">
          <span>
            当前高亮词：
            <span className="font-mono font-semibold">{highlight}</span>
            ，仅展示包含该词的整轮记录。
          </span>
        </div>
      )}
      <div className="card bg-base-200">
        <ul className="divide-y divide-base-300">
          {rounds.map((round, i) => (
            <RoundCard
              key={round.id}
              round={round}
              roundIndex={i}
              speakingId={speakingId}
              onSpeak={speak}
              highlight={highlight}
            />
          ))}
        </ul>
      </div>
      <div className="flex items-center justify-between">
        <p className="text-sm opacity-60">共 {total} 轮</p>
        <div className="join">
          <button
            type="button"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
            className="join-item btn btn-sm"
          >
            上一页
          </button>
          <span className="join-item btn btn-sm btn-disabled">
            {page} / {totalPages}
          </span>
          <button
            type="button"
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages}
            className="join-item btn btn-sm"
          >
            下一页
          </button>
        </div>
      </div>
    </div>
  );
}
