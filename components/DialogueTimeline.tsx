"use client";

import { Fragment, type ReactNode } from "react";
import {
  DialogueTtsPlayButton,
  DialogueTtsProvider,
} from "@/components/DialogueTtsContext";
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
  type TranscriptToolUseItem,
} from "@/lib/transcript-content";

function ThinkingBlock({
  block,
  blockKey,
}: {
  block: Extract<DialogueTimelineBlock, { kind: "thinking" }>;
  blockKey: string;
}) {
  return (
    <details
      key={blockKey}
      className="collapse collapse-arrow border border-base-300 bg-base-100"
    >
      <summary className="collapse-title min-h-0 py-2 text-xs font-medium">
        {`Thinking · ${block.data.model} · ${block.data.duration_ms}ms`}
      </summary>
      <div className="collapse-content relative pt-1 pr-12">
        <MarkdownContent className="text-sm">{block.data.text}</MarkdownContent>
        <div className="absolute right-2 top-2">
          <DialogueTtsPlayButton id={`${blockKey}-tts`} text={block.data.text} />
        </div>
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
    <div key={blockKey} className="relative pr-12">
      {(timeLabel || block.data.model) && (
        <div className="mb-1 text-[11px] opacity-60">
          {timeLabel}
          {block.data.model ? ` · ${block.data.model}` : ""}
        </div>
      )}
      <MarkdownContent className="break-words text-sm">{block.data.text}</MarkdownContent>
      <div className="absolute right-2 top-0">
        <DialogueTtsPlayButton id={`${blockKey}-tts`} text={block.data.text} />
      </div>
    </div>
  );
}

function summarizeTranscriptToolNames(tools: TranscriptToolUseItem[]): string {
  const counts = new Map<string, number>();
  for (const tool of tools) {
    counts.set(tool.name, (counts.get(tool.name) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([name, count]) => (count > 1 ? `${name}×${count}` : name))
    .join(", ");
}

function TranscriptToolGroupBlock({
  tools,
  blockKey,
  nested = false,
}: {
  tools: TranscriptToolUseItem[];
  blockKey: string;
  nested?: boolean;
}) {
  const countLabel = tools.length === 1 ? "1 次" : `${tools.length} 次`;
  return (
    <details
      key={blockKey}
      className={
        nested
          ? "collapse collapse-arrow collapse-sm border border-base-300/80 bg-base-200/50"
          : "collapse collapse-arrow border border-base-300 bg-base-100"
      }
    >
      <summary className="collapse-title min-h-0 py-2 text-xs font-medium">
        工具
        {` · ${countLabel} · ${summarizeTranscriptToolNames(tools)}`}
      </summary>
      <div className="collapse-content pt-1">
        <div className="flex flex-wrap gap-1.5">
          {tools.map((item, i) => (
            <TranscriptToolUseChip
              key={`${blockKey}-${i}`}
              name={item.name}
              input={item.input}
            />
          ))}
        </div>
      </div>
    </details>
  );
}

function TranscriptToolRoundsFold({
  batches,
  blockKey,
}: {
  batches: { tools: TranscriptToolUseItem[]; key: string }[];
  blockKey: string;
}) {
  const allTools = batches.flatMap((batch) => batch.tools);
  const roundLabel = batches.length === 1 ? "1 轮" : `${batches.length} 轮`;
  const countLabel = allTools.length === 1 ? "1 次" : `${allTools.length} 次`;
  return (
    <details
      key={blockKey}
      className="collapse collapse-arrow border border-base-300 bg-base-100"
    >
      <summary className="collapse-title min-h-0 py-2 text-xs font-medium">
        工具
        {` · ${roundLabel} · ${countLabel} · ${summarizeTranscriptToolNames(allTools)}`}
      </summary>
      <div className="collapse-content space-y-1 pt-1">
        {batches.map((batch) => (
          <TranscriptToolGroupBlock
            key={batch.key}
            blockKey={batch.key}
            tools={batch.tools}
            nested
          />
        ))}
      </div>
    </details>
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
      <div key={itemKey} className="relative pr-12">
        <MarkdownContent className="break-words text-sm">{item.text}</MarkdownContent>
        <div className="absolute right-2 top-0">
          <DialogueTtsPlayButton id={`${itemKey}-tts`} text={item.text} />
        </div>
      </div>
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

type TranscriptStepRow =
  | { kind: "content"; key: string; element: ReactNode }
  | { kind: "tool-batch"; key: string; tools: TranscriptToolUseItem[] };

function buildTranscriptStepRows(
  step: TranscriptAssistantStep,
  stepIdx: number
): TranscriptStepRow[] {
  const rows: TranscriptStepRow[] = [];
  const toolRun: TranscriptToolUseItem[] = [];

  const flushTools = (key: string) => {
    if (toolRun.length === 0) return;
    const batch = toolRun.splice(0, toolRun.length);
    rows.push({ kind: "tool-batch", key, tools: batch });
  };

  step.items.forEach((item, i) => {
    if (item.type === "tool_use") {
      toolRun.push(item);
      return;
    }
    flushTools(`step-${stepIdx}-tools-before-${i}`);
    rows.push({
      kind: "content",
      key: `step-${stepIdx}-item-${i}`,
      element: (
        <TranscriptContentItemView
          item={item}
          itemKey={`step-${stepIdx}-item-${i}`}
        />
      ),
    });
  });
  flushTools(`step-${stepIdx}-tools-tail`);
  return rows;
}

function renderTranscriptRows(rows: TranscriptStepRow[]): ReactNode[] {
  const result: ReactNode[] = [];
  let i = 0;
  while (i < rows.length) {
    const row = rows[i];
    if (row.kind === "content") {
      result.push(<Fragment key={row.key}>{row.element}</Fragment>);
      i += 1;
      continue;
    }

    const batches: { tools: TranscriptToolUseItem[]; key: string }[] = [];
    while (i < rows.length && rows[i].kind === "tool-batch") {
      const batchRow = rows[i] as Extract<TranscriptStepRow, { kind: "tool-batch" }>;
      batches.push({ tools: batchRow.tools, key: batchRow.key });
      i += 1;
    }

    if (batches.length === 1) {
      result.push(
        <TranscriptToolGroupBlock
          key={batches[0].key}
          blockKey={batches[0].key}
          tools={batches[0].tools}
        />
      );
    } else {
      result.push(
        <TranscriptToolRoundsFold
          key={`${batches[0].key}-fold`}
          blockKey={`${batches[0].key}-fold`}
          batches={batches}
        />
      );
    }
  }
  return result;
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
          {renderTranscriptRows(
            phase.steps.flatMap((step, stepIdx) =>
              buildTranscriptStepRows(step, stepIdx)
            )
          )}
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
      <DialogueTtsProvider>
        <TranscriptStepsTimeline
          steps={transcriptSteps}
          thinking={round?.thinking ?? []}
          tools={round?.tools ?? []}
        />
      </DialogueTtsProvider>
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
    <DialogueTtsProvider>
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
    </DialogueTtsProvider>
  );
}
