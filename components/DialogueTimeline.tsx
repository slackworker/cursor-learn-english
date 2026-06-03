"use client";

import type { ReactNode } from "react";
import { MarkdownContent } from "@/components/MarkdownContent";
import {
  buildDialogueTimeline,
  formatTimelineTime,
  summarizeToolNames,
  type DialogueTimelineBlock,
} from "@/lib/dialogue-timeline";
import type { TimelineRoundInput, TimelineTool } from "@/lib/dialogue-timeline";
import { buildInterleavedTranscriptPhases } from "@/lib/interleave-transcript";
import {
  isFileEditTool,
  toolUseLabel,
  type TranscriptAssistantStep,
  type TranscriptContentItem,
} from "@/lib/transcript-content";

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

function TranscriptToolUseChip({
  name,
  input,
}: {
  name: string;
  input: Record<string, unknown>;
}) {
  const label = toolUseLabel(name, input);
  const fileEdit = isFileEditTool(name);
  return (
    <span
      className={
        fileEdit
          ? "inline-flex items-center gap-1 rounded-md border border-success/40 bg-success/10 px-2 py-0.5 font-mono text-[11px] text-success"
          : "inline-flex items-center gap-1 rounded-md border border-base-300 bg-base-100 px-2 py-0.5 font-mono text-[11px] opacity-80"
      }
      title={typeof input.path === "string" ? input.path : undefined}
    >
      {fileEdit ? (
        <>
          <span className="font-semibold">{name}</span>
          <span className="opacity-70">{label}</span>
        </>
      ) : (
        label
      )}
    </span>
  );
}

function TranscriptContentItemView({
  item,
  itemKey,
}: {
  item: TranscriptContentItem;
  itemKey: string;
}) {
  if (item.type === "text") {
    return (
      <MarkdownContent key={itemKey} className="break-words text-sm">
        {item.text}
      </MarkdownContent>
    );
  }
  return (
    <TranscriptToolUseChip
      key={itemKey}
      name={item.name}
      input={item.input}
    />
  );
}

function TranscriptStepView({
  step,
  stepIdx,
}: {
  step: TranscriptAssistantStep;
  stepIdx: number;
}) {
        const toolRun: TranscriptContentItem[] = [];
        const flushTools = (key: string) => {
          if (toolRun.length === 0) return null;
          const batch = toolRun.splice(0, toolRun.length);
          return (
            <div key={key} className="flex flex-wrap gap-1.5">
              {batch.map((item, i) => (
                <TranscriptContentItemView
                  key={`${key}-${i}`}
                  item={item}
                  itemKey={`${key}-${i}`}
                />
              ))}
            </div>
          );
        };

        const rows: ReactNode[] = [];
        step.items.forEach((item, i) => {
          if (item.type === "tool_use") {
            toolRun.push(item);
            return;
          }
          const toolRow = flushTools(`step-${stepIdx}-tools-before-${i}`);
          if (toolRow) rows.push(toolRow);
          rows.push(
            <TranscriptContentItemView
              key={`step-${stepIdx}-item-${i}`}
              item={item}
              itemKey={`step-${stepIdx}-item-${i}`}
            />
          );
        });
        const tailTools = flushTools(`step-${stepIdx}-tools-tail`);
        if (tailTools) rows.push(tailTools);

  return (
    <div
      key={`step-${stepIdx}`}
      className="border-t border-success/20 pt-3 first:border-t-0 first:pt-0 space-y-2"
    >
      {rows}
    </div>
  );
}

/** Transcript steps interleaved with thinking via postToolUse / afterAgentThought timestamps. */
function TranscriptStepsTimeline({
  steps,
  thinking,
  tools,
}: {
  steps: TranscriptAssistantStep[];
  thinking: TimelineRoundInput["thinking"];
  tools: TimelineRoundInput["tools"];
}) {
  const phases = buildInterleavedTranscriptPhases(thinking, steps, tools);

  return (
    <div className="space-y-2">
      {phases.map((phase, phaseIdx) => (
        <div key={`phase-${phaseIdx}`} className="space-y-2">
          {phase.thinking ? (
            <ThinkingBlock
              key={`phase-${phaseIdx}-think-${phase.thinking.timestamp}`}
              blockKey={`phase-${phaseIdx}-think`}
              block={{
                kind: "thinking",
                timestamp: phase.thinking.timestamp,
                data: phase.thinking,
              }}
            />
          ) : null}
          {phase.steps.map((step, stepIdx) => (
            <TranscriptStepView
              key={`phase-${phaseIdx}-step-${stepIdx}`}
              step={step}
              stepIdx={stepIdx}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

export function DialogueTimeline({
  round,
  transcriptSegments,
  transcriptSteps,
  emptyMessage = "（该轮暂无助手文本）",
}: {
  round?: TimelineRoundInput;
  transcriptSegments?: string[];
  /** When set, render from agent-transcripts (text + tool_use) instead of events-only timeline. */
  transcriptSteps?: TranscriptAssistantStep[];
  emptyMessage?: string;
}) {
  if (transcriptSteps && transcriptSteps.length > 0) {
    return (
      <TranscriptStepsTimeline
        steps={transcriptSteps}
        thinking={round?.thinking ?? []}
        tools={round?.tools ?? []}
      />
    );
  }

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
