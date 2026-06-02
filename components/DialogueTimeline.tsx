"use client";

import { MarkdownContent } from "@/components/MarkdownContent";
import {
  buildDialogueTimeline,
  formatTimelineTime,
  type DialogueTimelineBlock,
} from "@/lib/dialogue-timeline";
import type { TimelineRoundInput } from "@/lib/dialogue-timeline";

function ThinkingBlock({
  block,
  blockKey,
}: {
  block: Extract<DialogueTimelineBlock, { kind: "thinking" }>;
  blockKey: string;
}) {
  const timeLabel = formatTimelineTime(block.timestamp);
  return (
    <details
      key={blockKey}
      className="collapse collapse-arrow border border-base-300 bg-base-100"
    >
      <summary className="collapse-title min-h-0 py-2 text-xs font-medium">
        Thinking
        {timeLabel ? ` · ${timeLabel}` : ""}
        {` · ${block.data.model} · ${block.data.duration_ms}ms`}
      </summary>
      <div className="collapse-content pt-1">
        <MarkdownContent className="text-sm">{block.data.text}</MarkdownContent>
      </div>
    </details>
  );
}

function ToolBlock({
  block,
  blockKey,
}: {
  block: Extract<DialogueTimelineBlock, { kind: "tool" }>;
  blockKey: string;
}) {
  const timeLabel = formatTimelineTime(block.timestamp);
  const tool = block.data;
  return (
    <div
      key={blockKey}
      className="rounded border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-warning"
    >
      <span className="font-medium">工具</span>
      {timeLabel ? ` · ${timeLabel.slice(11)}` : ""}
      {` · ${tool.tool_name || "unknown"} · ${tool.event_type}`}
      {tool.duration ? ` · ${tool.duration}ms` : ""}
      {tool.failure_type ? ` · ${tool.failure_type}` : ""}
    </div>
  );
}

function ResponseBlock({
  block,
  blockKey,
}: {
  block: Extract<DialogueTimelineBlock, { kind: "response" }>;
  blockKey: string;
}) {
  const timeLabel = formatTimelineTime(block.timestamp);
  return (
    <div key={blockKey} className="border-t border-success/20 pt-3 first:border-t-0 first:pt-0">
      {(timeLabel || block.data.model) && (
        <div className="mb-1 text-[11px] opacity-60">
          {timeLabel}
          {block.data.model ? ` · ${block.data.model}` : ""}
        </div>
      )}
      <MarkdownContent className="break-words text-sm">{block.data.text}</MarkdownContent>
    </div>
  );
}

export function DialogueTimeline({
  round,
  transcriptSegments,
  emptyMessage = "（该轮暂无助手文本）",
}: {
  round?: TimelineRoundInput;
  transcriptSegments?: string[];
  emptyMessage?: string;
}) {
  if (!round) {
    return <p className="text-sm opacity-60">{emptyMessage}</p>;
  }

  const blocks = buildDialogueTimeline(round, transcriptSegments);
  if (blocks.length === 0) {
    return <p className="text-sm opacity-60">{emptyMessage}</p>;
  }

  return (
    <div className="space-y-2">
      {blocks.map((block, idx) => {
        const blockKey = `${block.kind}-${block.timestamp}-${idx}`;
        if (block.kind === "thinking") {
          return <ThinkingBlock key={blockKey} block={block} blockKey={blockKey} />;
        }
        if (block.kind === "tool") {
          return <ToolBlock key={blockKey} block={block} blockKey={blockKey} />;
        }
        return <ResponseBlock key={blockKey} block={block} blockKey={blockKey} />;
      })}
    </div>
  );
}
