"use client";

import { useEffect, useState } from "react";
import { MarkdownContent } from "@/components/MarkdownContent";
import { DialogueTimeline } from "@/components/DialogueTimeline";
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
  response_segments?: Array<{
    text: string;
    timestamp: string;
    model?: string | null;
  }>;
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

function RoundCard({
  round,
  highlight,
}: {
  round: DialogueRound;
  highlight: string;
}) {
  const [showFullPrompt, setShowFullPrompt] = useState(false);
  const prompt = round.prompt ?? "";
  const isLongPrompt = prompt.length > 200;
  const promptDisplay = applyHighlightMarkdown(
    showFullPrompt || !isLongPrompt ? prompt : `${prompt.slice(0, 200)}...`,
    highlight
  );
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
        <MarkdownContent className="whitespace-pre-wrap break-words text-sm">
          {promptDisplay}
        </MarkdownContent>
      </div>

      <div className="rounded-lg border border-success/30 bg-success/10 p-3 mb-3">
        <div className="mb-2 text-xs font-medium text-success">助手回复与推理过程</div>
        <DialogueTimeline
          round={round}
          emptyMessage="未采集到该轮助手完整回复（请更新 hooks 后重试）。"
        />
      </div>

      <div className="mb-2 text-[11px] opacity-70">
        会话：<span className="font-mono">{round.conversation_id}</span>
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
          {rounds.map((round) => (
            <RoundCard key={round.id} round={round} highlight={highlight} />
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
