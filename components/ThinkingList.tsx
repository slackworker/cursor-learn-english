"use client";

import { useEffect, useState } from "react";
import { MarkdownContent } from "@/components/MarkdownContent";
import { DialogueTimeline } from "@/components/DialogueTimeline";
import { EmptyState, LoadingState } from "@/components/ui/EmptyState";
import { MessageBubble } from "@/components/ui/MessageBubble";
import { Pagination } from "@/components/ui/Pagination";
import { Surface } from "@/components/ui/Surface";
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
    <li className="dialogue-item">
      <MessageBubble
        variant="user"
        label="用户问题"
        action={
          isLongPrompt ? (
            <button
              type="button"
              className="btn btn-ghost btn-xs text-[11px]"
              onClick={() => setShowFullPrompt((v) => !v)}
            >
              {showFullPrompt ? "收起" : "展开"}
            </button>
          ) : undefined
        }
      >
        <MarkdownContent className="whitespace-pre-wrap break-words">
          {promptDisplay}
        </MarkdownContent>
      </MessageBubble>

      <div className="mt-3">
        <MessageBubble variant="assistant" label="助手回复与推理过程">
          <DialogueTimeline
            round={round}
            emptyMessage="未采集到该轮助手完整回复（请更新 hooks 后重试）。"
          />
        </MessageBubble>
      </div>

      <div className="dialogue-item-meta mt-3">
        会话 {round.conversation_id}
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
    return <LoadingState />;
  }

  if (rounds.length === 0) {
    return (
      <EmptyState>
        暂无完整轮次记录。请先在更新后的 Hooks 配置下继续对话生成数据。
      </EmptyState>
    );
  }

  const totalPages = Math.ceil(total / pageSize);

  return (
    <div className="space-y-4">
      {highlight && (
        <div className="banner-info">
          当前高亮词：
          <span className="font-mono font-semibold">{highlight}</span>
          ，仅展示包含该词的整轮记录。
        </div>
      )}
      <Surface padding="none">
        <ul className="dialogue-list">
          {rounds.map((round) => (
            <RoundCard key={round.id} round={round} highlight={highlight} />
          ))}
        </ul>
      </Surface>
      <Pagination
        page={page}
        totalPages={totalPages}
        onPrev={() => setPage((p) => Math.max(1, p - 1))}
        onNext={() => setPage((p) => Math.min(totalPages, p + 1))}
        summary={`共 ${total} 轮`}
      />
    </div>
  );
}
