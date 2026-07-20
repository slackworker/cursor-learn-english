"use client";

import Link from "next/link";
import {
  createContext,
  Fragment,
  useContext,
  type ReactNode,
} from "react";
import {
  DialogueTtsPlayButton,
  DialogueTtsProvider,
} from "@/components/DialogueTtsContext";
import { MarkdownContent } from "@/components/MarkdownContent";
import {
  buildDialogueTimeline,
  formatTimelineTime,
  splitTimelineProcessAndFinal,
  summarizeToolNames,
  type DialogueTimelineBlock,
} from "@/lib/dialogue-timeline";
import type { TimelineRoundInput, TimelineTool } from "@/lib/dialogue-timeline";
import {
  buildInterleavedTranscriptPhases,
  flattenPhasesToUnits,
  splitProcessAndFinalUnits,
  type ProcessTimelineUnit,
} from "@/lib/interleave-transcript";
import {
  buildProcessActivityTree,
  editActivityLine,
  editDiffPreviewLines,
  editDiffStatsFromTool,
  isEditToolName,
  thoughtFoldLabel,
  toolActivityLine,
  workedFoldSummary,
  type ProcessActivityItem,
  type ProcessActivityNode,
} from "@/lib/process-activity";
import type { SessionSubagentLink } from "@/lib/sessions";
import { resolveTaskSubagent } from "@/lib/task-subagent";
import {
  isFileEditTool,
  toolUseLabel,
  type TranscriptAssistantStep,
  type TranscriptContentItem,
  type TranscriptToolUseItem,
} from "@/lib/transcript-content";
import "./process-fold.css";

const TaskSubagentsContext = createContext<SessionSubagentLink[] | null>(null);

/** Flat Cursor-like fold chrome — no nested card padding/indent. */
const PROCESS_FOLD_CLASS =
  "process-fold collapse !rounded-none !border-0 !bg-transparent";
const PROCESS_FOLD_TITLE_CLASS =
  "collapse-title process-fold-title !min-h-0 !w-fit !max-w-full !py-1.5 !px-0 !pe-0 text-xs font-medium";
const PROCESS_FOLD_CONTENT_CLASS = "collapse-content !px-0 !pb-1.5 !pt-1";

/** Right gutter for TTS — centers the control on the first text line. */
const TTS_CONTROL_CLASS =
  "flex h-[1lh] w-8 shrink-0 items-center justify-center self-start";

function FoldChevron() {
  return (
    <span className="process-fold-chevron" aria-hidden>
      {/* Collapsed: › — shown on summary hover only (see globals.css) */}
      <svg
        className="process-fold-chevron-icon process-fold-chevron-closed"
        viewBox="0 0 16 16"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M6 3.5 10.5 8 6 12.5" />
      </svg>
      {/* Expanded: ∨ — always visible while this details is open */}
      <svg
        className="process-fold-chevron-icon process-fold-chevron-open"
        viewBox="0 0 16 16"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M3.5 6 8 10.5 12.5 6" />
      </svg>
    </span>
  );
}

function ProcessFoldSummary({ children }: { children: ReactNode }) {
  return (
    <summary className={PROCESS_FOLD_TITLE_CLASS}>
      <span className="process-fold-label">{children}</span>
      <FoldChevron />
    </summary>
  );
}

function TextWithTts({
  id,
  text,
  className = "",
}: {
  id: string;
  text: string;
  className?: string;
}) {
  return (
    <div className="flex items-start gap-0 text-sm leading-relaxed">
      <MarkdownContent
        className={`min-w-0 flex-1 break-words ${className}`.trim()}
      >
        {text}
      </MarkdownContent>
      <div className={TTS_CONTROL_CLASS}>
        <DialogueTtsPlayButton id={id} text={text} />
      </div>
    </div>
  );
}

function ProcessFold({
  summary,
  children,
}: {
  summary: string;
  children: ReactNode;
}) {
  return (
    <details className={PROCESS_FOLD_CLASS}>
      <ProcessFoldSummary>{summary}</ProcessFoldSummary>
      <div className={`${PROCESS_FOLD_CONTENT_CLASS} space-y-1`}>{children}</div>
    </details>
  );
}

function ThinkingBlock({
  block,
  blockKey,
}: {
  block: Extract<DialogueTimelineBlock, { kind: "thinking" }>;
  blockKey: string;
}) {
  return (
    <details key={blockKey} className={PROCESS_FOLD_CLASS}>
      <ProcessFoldSummary>{thoughtFoldLabel(block.data)}</ProcessFoldSummary>
      <div className={PROCESS_FOLD_CONTENT_CLASS}>
        <TextWithTts id={`${blockKey}-tts`} text={block.data.text} />
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
}: {
  tools: TranscriptToolUseItem[];
  blockKey: string;
}) {
  const countLabel = tools.length === 1 ? "1 次" : `${tools.length} 次`;
  return (
    <details key={blockKey} className={PROCESS_FOLD_CLASS}>
      <ProcessFoldSummary>
        工具
        {` · ${countLabel} · ${summarizeTranscriptToolNames(tools)}`}
      </ProcessFoldSummary>
      <div className={PROCESS_FOLD_CONTENT_CLASS}>
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
    <details key={blockKey} className={PROCESS_FOLD_CLASS}>
      <ProcessFoldSummary>
        工具
        {` · ${roundLabel} · ${countLabel} · ${summarizeTranscriptToolNames(allTools)}`}
      </ProcessFoldSummary>
      <div className={`${PROCESS_FOLD_CONTENT_CLASS} space-y-1`}>
        {batches.map((batch) => (
          <TranscriptToolGroupBlock
            key={batch.key}
            blockKey={batch.key}
            tools={batch.tools}
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
  const subagents = useContext(TaskSubagentsContext);
  const label = toolUseLabel(name, input);
  const fileEdit = isFileEditTool(name);
  const linked =
    name === "Task" && subagents
      ? resolveTaskSubagent(input, subagents)
      : undefined;
  const href = linked
    ? `/sessions/${encodeURIComponent(linked.session_id)}`
    : undefined;
  const title =
    linked != null
      ? `${linked.subagent_type ? `${linked.subagent_type} · ` : ""}${
          linked.title ?? linked.task_description ?? linked.session_id
        }`
      : typeof input.path === "string"
        ? input.path
        : typeof input.description === "string"
          ? input.description
          : undefined;

  const className = fileEdit
    ? "inline-flex items-center gap-1 rounded-md border border-success/40 bg-success/10 px-2 py-0.5 font-mono text-[11px] text-success"
    : href
      ? "inline-flex items-center gap-1 rounded-md border border-info/40 bg-info/10 px-2 py-0.5 font-mono text-[11px] text-info underline-offset-2 hover:underline"
      : "inline-flex items-center gap-1 rounded-md border border-base-300 bg-base-100 px-2 py-0.5 font-mono text-[11px] opacity-80";

  const body = fileEdit ? (
    <>
      <span className="font-semibold">{name}</span>
      <span className="opacity-70">{label}</span>
    </>
  ) : (
    label
  );

  if (href) {
    return (
      <Link href={href} className={className} title={title}>
        {body}
      </Link>
    );
  }

  return (
    <span className={className} title={title}>
      {body}
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
      <TextWithTts key={itemKey} id={`${itemKey}-tts`} text={item.text} />
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
  stepKey: string | number
): TranscriptStepRow[] {
  const rows: TranscriptStepRow[] = [];
  const toolRun: TranscriptToolUseItem[] = [];
  const prefix = String(stepKey);

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
    flushTools(`${prefix}-tools-before-${i}`);
    rows.push({
      kind: "content",
      key: `${prefix}-item-${i}`,
      element: (
        <TranscriptContentItemView
          item={item}
          itemKey={`${prefix}-item-${i}`}
        />
      ),
    });
  });
  flushTools(`${prefix}-tools-tail`);
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

function TaskProcessRow({
  tool,
}: {
  tool: TranscriptToolUseItem;
}) {
  return (
    <div className="flex items-start gap-2 py-0.5 text-xs">
      <span className="mt-0.5 opacity-50" aria-hidden>
        •
      </span>
      <div className="min-w-0 flex-1">
        <TranscriptToolUseChip name={tool.name} input={tool.input} />
      </div>
    </div>
  );
}

/** Cursor-like Shell card: `>_ ` title, expands to show the command. */
function ShellToolLine({
  tool,
  line,
}: {
  tool: TranscriptToolUseItem;
  line?: string;
}) {
  const label = line ?? toolActivityLine(tool);
  const command =
    typeof tool.input.command === "string" ? tool.input.command : "";

  if (!command) {
    return (
      <div className="process-shell-line">
        <span className="process-shell-prompt" aria-hidden>
          {">_ "}
        </span>
        <span className="process-shell-label">{label}</span>
      </div>
    );
  }

  return (
    <details className="process-shell-line process-shell-fold">
      <summary className="process-shell-summary">
        <span className="process-shell-prompt" aria-hidden>
          {">_ "}
        </span>
        <span className="process-shell-label">{label}</span>
      </summary>
      <pre className="process-shell-command" tabIndex={0}>
        {command}
      </pre>
    </details>
  );
}

/** Cursor-like file edit card: "⚛ file.tsx +1 -1" with expandable hunk. */
function EditToolLine({ tool }: { tool: TranscriptToolUseItem }) {
  const title = editActivityLine(tool);
  const stats = editDiffStatsFromTool(tool);
  const preview = editDiffPreviewLines(tool);
  const path = typeof tool.input.path === "string" ? tool.input.path : "";
  const base = path.split(/[/\\]/).pop() || tool.name;

  const titleNodes = (() => {
    const iconEnd = title.indexOf(" ");
    const icon = iconEnd > 0 ? title.slice(0, iconEnd) : "";
    const rest = iconEnd > 0 ? title.slice(iconEnd + 1) : title;
    const statsMatch = rest.match(/^(.*)\s(\+\d+)\s(-\d+)$/);
    if (statsMatch) {
      return (
        <>
          <span className="process-edit-icon" aria-hidden>
            {icon}
          </span>
          <span className="process-edit-name">{statsMatch[1]}</span>
          <span className="process-edit-plus">{statsMatch[2]}</span>
          <span className="process-edit-minus">{statsMatch[3]}</span>
        </>
      );
    }
    return (
      <>
        <span className="process-edit-icon" aria-hidden>
          {icon}
        </span>
        <span className="process-edit-name">{rest || base}</span>
      </>
    );
  })();

  if (preview.length === 0) {
    return <div className="process-edit-line">{titleNodes}</div>;
  }

  return (
    <details className="process-edit-line process-edit-fold">
      <summary className="process-edit-summary">{titleNodes}</summary>
      <div className="process-edit-diff" role="region" aria-label={`${base} diff`}>
        {preview.map((row, idx) => (
          <div
            key={`${row.type}-${idx}`}
            className={
              row.type === "add" ? "process-edit-add" : "process-edit-del"
            }
          >
            <span className="process-edit-mark" aria-hidden>
              {row.type === "add" ? "+" : "-"}
            </span>
            <span className="process-edit-text">{row.text || " "}</span>
          </div>
        ))}
        {stats && preview.length >= 80 ? (
          <div className="process-edit-more">…</div>
        ) : null}
      </div>
    </details>
  );
}

function isShellToolName(name: string): boolean {
  return name === "Shell" || name === "AwaitShell";
}

function ActivityItemViews({
  items,
  blockKey,
}: {
  items: ProcessActivityItem[];
  blockKey: string;
}) {
  return (
    <>
      {items.map((item, idx) => {
        const itemKey = `${blockKey}-item-${idx}`;
        if (item.kind === "tool") {
          if (isEditToolName(item.tool.name)) {
            return <EditToolLine key={itemKey} tool={item.tool} />;
          }
          if (isShellToolName(item.tool.name)) {
            return (
              <ShellToolLine
                key={itemKey}
                tool={item.tool}
                line={item.line}
              />
            );
          }
          return (
            <div
              key={itemKey}
              className="font-mono text-[11px] leading-relaxed opacity-80"
            >
              {item.line ?? toolActivityLine(item.tool)}
            </div>
          );
        }
        if (item.kind === "thinking") {
          return (
            <ThinkingBlock
              key={itemKey}
              blockKey={itemKey}
              block={{
                kind: "thinking",
                timestamp: item.thinking.timestamp,
                data: item.thinking,
              }}
            />
          );
        }
        return (
          <TextWithTts
            key={itemKey}
            id={`${itemKey}-tts`}
            text={item.text}
            className="opacity-90"
          />
        );
      })}
    </>
  );
}

function ActivityGroupFold({
  node,
  blockKey,
}: {
  node: Extract<ProcessActivityNode, { kind: "activity" }>;
  blockKey: string;
}) {
  return (
    <details key={blockKey} className={PROCESS_FOLD_CLASS}>
      <ProcessFoldSummary>{node.summary}</ProcessFoldSummary>
      <div className={`${PROCESS_FOLD_CONTENT_CLASS} space-y-1`}>
        <ActivityItemViews items={node.items} blockKey={blockKey} />
      </div>
    </details>
  );
}

function renderProcessActivityNodes(
  nodes: ProcessActivityNode[]
): ReactNode[] {
  return nodes.map((node, idx) => {
    const blockKey = `process-node-${idx}`;
    if (node.kind === "thinking") {
      return (
        <ThinkingBlock
          key={blockKey}
          blockKey={blockKey}
          block={{
            kind: "thinking",
            timestamp: node.thinking.timestamp,
            data: node.thinking,
          }}
        />
      );
    }
    if (node.kind === "task") {
      return <TaskProcessRow key={blockKey} tool={node.tool} />;
    }
    if (node.kind === "tool-line") {
      if (isEditToolName(node.tool.name)) {
        return <EditToolLine key={blockKey} tool={node.tool} />;
      }
      if (isShellToolName(node.tool.name)) {
        return <ShellToolLine key={blockKey} tool={node.tool} />;
      }
      return (
        <div
          key={blockKey}
          className="font-mono text-[11px] leading-relaxed opacity-80"
        >
          {toolActivityLine(node.tool)}
        </div>
      );
    }
    if (node.kind === "activity") {
      return (
        <ActivityGroupFold key={blockKey} blockKey={blockKey} node={node} />
      );
    }
    return (
      <TextWithTts
        key={blockKey}
        id={`${blockKey}-tts`}
        text={node.text}
      />
    );
  });
}

function renderProcessUnits(units: ProcessTimelineUnit[]): ReactNode[] {
  const nodes: ReactNode[] = [];
  for (const unit of units) {
    if (unit.kind === "thinking") {
      const blockKey = `process-think-${unit.thinking.timestamp}`;
      nodes.push(
        <ThinkingBlock
          key={blockKey}
          blockKey={blockKey}
          block={{
            kind: "thinking",
            timestamp: unit.thinking.timestamp,
            data: unit.thinking,
          }}
        />
      );
      continue;
    }
    nodes.push(
      ...renderTranscriptRows(buildTranscriptStepRows(unit.step, unit.stepKey))
    );
  }
  return nodes;
}

/** Transcript steps interleaved with thinking via postToolUse / afterAgentThought timestamps. */
function TranscriptStepsTimeline({
  steps,
  thinking,
  tools,
  replyAfterTimestamp,
}: {
  steps: TranscriptAssistantStep[];
  thinking: TimelineRoundInput["thinking"];
  tools: TimelineRoundInput["tools"];
  replyAfterTimestamp?: string;
}) {
  const phases = buildInterleavedTranscriptPhases(thinking, steps, tools, {
    replyAfterTimestamp,
  });
  const { process, final } = splitProcessAndFinalUnits(
    flattenPhasesToUnits(phases)
  );

  const activityNodes = buildProcessActivityTree(process);
  const processNodes =
    activityNodes.length > 0 ? (
      <ProcessFold summary={workedFoldSummary(process, tools)}>
        {renderProcessActivityNodes(activityNodes)}
      </ProcessFold>
    ) : null;

  const finalNodes = renderProcessUnits(final);

  if (!processNodes && finalNodes.length === 0) {
    return null;
  }

  return (
    <div className="space-y-2">
      {processNodes}
      {finalNodes.length > 0 ? (
        <div className="space-y-2">{finalNodes}</div>
      ) : null}
    </div>
  );
}

export function DialogueTimeline({
  round,
  transcriptSegments,
  transcriptSteps,
  subagents,
  emptyMessage = "（该轮暂无助手文本）",
}: {
  round?: TimelineRoundInput;
  transcriptSegments?: string[];
  /** When set, render from agent-transcripts (text + tool_use) instead of events-only timeline. */
  transcriptSteps?: TranscriptAssistantStep[];
  /** Parent session's Task children — used to link Task chips to subagent pages. */
  subagents?: SessionSubagentLink[];
  emptyMessage?: string;
}) {
  const body = (() => {
    if (transcriptSteps && transcriptSteps.length > 0) {
      const replyAfterTimestamp =
        round?.response_segments?.at(-1)?.timestamp ??
        round?.response?.timestamp;
      return (
        <TranscriptStepsTimeline
          steps={transcriptSteps}
          thinking={round?.thinking ?? []}
          tools={round?.tools ?? []}
          replyAfterTimestamp={replyAfterTimestamp}
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

    const { process, final } = splitTimelineProcessAndFinal(blocks);

    const renderBlock = (
      block: DialogueTimelineBlock,
      idx: number
    ) => {
      const blockKey = `${block.kind}-${block.timestamp}-${idx}`;
      if (block.kind === "thinking") {
        return (
          <ThinkingBlock
            key={blockKey}
            block={block}
            blockKey={blockKey}
          />
        );
      }
      if (block.kind === "tool-group") {
        return (
          <ToolGroupBlock
            key={blockKey}
            block={block}
            blockKey={blockKey}
          />
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
  })();

  return (
    <TaskSubagentsContext.Provider value={subagents ?? null}>
      <DialogueTtsProvider>{body}</DialogueTtsProvider>
    </TaskSubagentsContext.Provider>
  );
}
