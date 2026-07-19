"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { DialogueTimeline } from "@/components/DialogueTimeline";
import { SessionTitleView } from "@/components/SessionTitleView";
import { UserPromptView } from "@/components/UserPromptView";
import { EmptyState, LoadingState } from "@/components/ui/EmptyState";
import { MessageBubble } from "@/components/ui/MessageBubble";
import { Pagination } from "@/components/ui/Pagination";
import { Surface } from "@/components/ui/Surface";
import {
  parseUserPromptWithDomContext,
  type DomContextBlock,
  type PromptSegment,
} from "@/lib/parse-dom-context";

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
  session_title?: string;
  session_title_dom_contexts?: DomContextBlock[];
  session_title_segments?: PromptSegment[];
  session_title_body?: string;
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

function RoundCard({ round }: { round: DialogueRound }) {
  const [showFullPrompt, setShowFullPrompt] = useState(false);
  const prompt = round.prompt ?? "";
  const { segments, body } = useMemo(
    () => parseUserPromptWithDomContext(prompt),
    [prompt]
  );
  const isLongPrompt = body.length > 200;
  const displaySegments = useMemo(() => {
    if (showFullPrompt || !isLongPrompt) return segments;
    let remaining = 200;
    const out: typeof segments = [];
    for (const seg of segments) {
      if (seg.type === "dom") {
        out.push(seg);
        continue;
      }
      if (remaining <= 0) break;
      if (seg.text.length <= remaining) {
        out.push(seg);
        remaining -= seg.text.length;
      } else {
        out.push({ type: "text", text: `${seg.text.slice(0, remaining)}...` });
        remaining = 0;
        break;
      }
    }
    return out;
  }, [segments, showFullPrompt, isLongPrompt]);
  const sessionFallback = `会话 ${round.conversation_id.slice(0, 8)}…`;
  return (
    <li className="dialogue-item">
      <MessageBubble
        variant="user"
        label="用户提示词"
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
        <UserPromptView
          prompt={body}
          segments={displaySegments}
        />
      </MessageBubble>

      <div className="mt-3">
        <MessageBubble variant="assistant" label="Cursor回复">
          <DialogueTimeline
            round={round}
            emptyMessage="未采集到该轮助手完整回复（请更新 hooks 后重试）。"
          />
        </MessageBubble>
      </div>

      <div className="dialogue-item-meta mt-3">
        <Link
          href={`/sessions/${encodeURIComponent(round.conversation_id)}`}
          title={
            round.session_title
              ? `${round.session_title} (${round.conversation_id})`
              : round.conversation_id
          }
          className="inline-flex min-w-0 max-w-full flex-wrap items-baseline gap-1 font-sans text-base-content/55 underline-offset-2 hover:underline"
        >
          <span className="shrink-0">会话</span>
          <SessionTitleView
            title={round.session_title}
            segments={round.session_title_segments}
            domContexts={round.session_title_dom_contexts}
            body={round.session_title_body}
            fallback={sessionFallback}
            variant="wrap"
            className="min-w-0 font-normal"
          />
        </Link>
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

  useEffect(() => {
    const url = new URL("/api/dialogues", window.location.origin);
    url.searchParams.set("page", String(page));
    url.searchParams.set("pageSize", String(pageSize));
    fetch(url.toString())
      .then((r) => r.json())
      .then((res) => {
        setRounds(res.rounds ?? []);
        setTotal(res.total ?? 0);
      })
      .catch(() => setRounds([]))
      .finally(() => setIsLoaded(true));
  }, [page]);

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
      <Surface padding="none">
        <ul className="dialogue-list">
          {rounds.map((round) => (
            <RoundCard key={round.id} round={round} />
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
