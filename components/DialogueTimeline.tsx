"use client";

import { MarkdownContent } from "@/components/MarkdownContent";
import {
  buildDialogueTimeline,
  formatTimelineTime,
  summarizeToolNames,
  type DialogueTimelineBlock,
} from "@/lib/dialogue-timeline";
import type { TimelineRoundInput, TimelineTool } from "@/lib/dialogue-timeline";

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

function formatToolTimeRange(start: string, end: string): string {
  const startLabel = formatTimelineTime(start);
  const endLabel = formatTimelineTime(end);
  if (!startLabel) return "";
  if (!endLabel || startLabel === endLabel) return startLabel.slice(11);
  return `${startLabel.slice(11)}–${endLabel.slice(11)}`;
}

function formatToolLine(tool: TimelineTool): string {
  const timeLabel = formatTimelineTime(tool.timestamp);
  const parts = [
    timeLabel ? timeLabel.slice(11) : null,
    tool.tool_name || "unknown",
    tool.event_type,
    tool.duration != null ? `${tool.duration}ms` : null,
    tool.failure_type ?? null,
  ].filter(Boolean);
  return parts.join(" · ");
}

function ToolGroupBlock({
  block,
  blockKey,
}: {
  block: Extract<DialogueTimelineBlock, { kind: "tool-group" }>;
  blockKey: string;
}) {
  const { tools } = block;
  const timeRange = formatToolTimeRange(block.timestamp, block.endTimestamp);
  const countLabel = tools.length === 1 ? "1 次" : `${tools.length} 次`;
  return (
    <details
      key={blockKey}
      className="collapse collapse-arrow border border-base-300 bg-base-100"
    >
      <summary className="collapse-title min-h-0 py-2 text-xs font-medium">
        工具
        {timeRange ? ` · ${timeRange}` : ""}
        {` · ${countLabel} · ${summarizeToolNames(tools)}`}
      </summary>
      <div className="collapse-content pt-1">
        <ul className="space-y-0.5 font-mono text-[11px] opacity-70">
          {tools.map((tool, idx) => (
            <li key={`${tool.timestamp}-${tool.tool_name ?? "tool"}-${idx}`}>
              {formatToolLine(tool)}
            </li>
          ))}
        </ul>
      </div>
    </details>
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
        if (block.kind === "tool-group") {
          return <ToolGroupBlock key={blockKey} block={block} blockKey={blockKey} />;
        }
        if (block.kind === "response") {
          return <ResponseBlock key={blockKey} block={block} blockKey={blockKey} />;
        }
        return null;
      })}
    </div>
  );
}
