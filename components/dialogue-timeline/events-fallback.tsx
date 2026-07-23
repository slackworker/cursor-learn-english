"use client";

import {
  buildDialogueTimeline,
  formatTimelineTime,
  splitTimelineProcessAndFinal,
  summarizeToolNames,
  type DialogueTimelineBlock,
  type TimelineRoundInput,
  type TimelineTool,
} from "@/lib/dialogue-timeline";
import {
  PROCESS_FOLD_CLASS,
  PROCESS_FOLD_CONTENT_CLASS,
  ProcessFold,
  ProcessFoldSummary,
  TextWithTts,
  ThinkingBlock,
} from "./fold";

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
    <details key={blockKey} className={PROCESS_FOLD_CLASS}>
      <ProcessFoldSummary>
        工具
        {timeRange ? ` · ${timeRange}` : ""}
        {` · ${countLabel} · ${summarizeToolNames(tools)}`}
      </ProcessFoldSummary>
      <div className={PROCESS_FOLD_CONTENT_CLASS}>
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

function ResponseMeta({
  timestamp,
  model,
}: {
  timestamp?: string;
  model?: string | null;
}) {
  const timeLabel = timestamp ? formatTimelineTime(timestamp) : "";
  if (!timeLabel && !model) return null;
  return (
    <div className="mb-1 text-[11px] opacity-60">
      {timeLabel}
      {model ? `${timeLabel ? " · " : ""}${model}` : ""}
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
  return (
    <div key={blockKey}>
      <ResponseMeta timestamp={block.timestamp} model={block.data.model} />
      <TextWithTts id={`${blockKey}-tts`} text={block.data.text} />
    </div>
  );
}

/** Events-only fallback when agent-transcripts steps are unavailable. */
export function EventsFallbackTimeline({
  round,
  transcriptSegments,
  emptyMessage,
}: {
  round: TimelineRoundInput;
  transcriptSegments?: string[];
  emptyMessage: string;
}) {
  const blocks = buildDialogueTimeline(round, transcriptSegments);
  if (blocks.length === 0) {
    return <p className="text-sm opacity-60">{emptyMessage}</p>;
  }

  const { process, final } = splitTimelineProcessAndFinal(blocks);

  const renderBlock = (block: DialogueTimelineBlock, idx: number) => {
    const blockKey = `${block.kind}-${block.timestamp}-${idx}`;
    if (block.kind === "thinking") {
      return (
        <ThinkingBlock key={blockKey} block={block} blockKey={blockKey} />
      );
    }
    if (block.kind === "tool-group") {
      return (
        <ToolGroupBlock key={blockKey} block={block} blockKey={blockKey} />
      );
    }
    if (block.kind === "response") {
      return <ResponseBlock key={blockKey} block={block} blockKey={blockKey} />;
    }
    return null;
  };

  const processSummary = (() => {
    const parts = ["过程"];
    const thinkingCount = process.filter((b) => b.kind === "thinking").length;
    const toolBlocks = process.filter(
      (b): b is Extract<DialogueTimelineBlock, { kind: "tool-group" }> =>
        b.kind === "tool-group"
    );
    const allTools = toolBlocks.flatMap((b) => b.tools);
    if (thinkingCount > 0) {
      parts.push(
        thinkingCount === 1 ? "Thinking×1" : `Thinking×${thinkingCount}`
      );
    }
    if (allTools.length > 0) {
      const countLabel =
        allTools.length === 1 ? "1 次" : `${allTools.length} 次`;
      parts.push(`工具 · ${countLabel} · ${summarizeToolNames(allTools)}`);
    }
    return parts.join(" · ");
  })();

  return (
    <div className="space-y-2">
      {process.length > 0 ? (
        <ProcessFold summary={processSummary}>
          {process.map((block, idx) => renderBlock(block, idx))}
        </ProcessFold>
      ) : null}
      {final.map((block, idx) => renderBlock(block, idx))}
    </div>
  );
}
