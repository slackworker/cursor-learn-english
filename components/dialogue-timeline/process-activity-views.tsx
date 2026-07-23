"use client";

import type { ReactNode } from "react";
import {
  PROCESS_FOLD_CLASS,
  PROCESS_FOLD_CONTENT_CLASS,
  ProcessFoldSummary,
  TextWithTts,
  ThinkingBlock,
} from "./fold";
import {
  buildTranscriptStepRows,
  renderTranscriptRows,
  TranscriptToolUseChip,
} from "./transcript-tools";
import type { ProcessTimelineUnit } from "@/lib/interleave-transcript";
import {
  editActivityLine,
  editDiffPreviewLines,
  editDiffStatsFromTool,
  isEditToolName,
  toolActivityLine,
  type ProcessActivityItem,
  type ProcessActivityNode,
} from "@/lib/process-activity";
import type { TranscriptToolUseItem } from "@/lib/transcript-content";

function TaskProcessRow({ tool }: { tool: TranscriptToolUseItem }) {
  return (
    <div className="flex items-start gap-2 py-0.5 text-sm">
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
          {">_"}
        </span>
        <span className="process-shell-label">{label}</span>
      </div>
    );
  }

  return (
    <details className="process-shell-line process-shell-fold">
      <summary className="process-shell-summary">
        <span className="process-shell-prompt" aria-hidden>
          {">_"}
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

export function renderProcessActivityNodes(
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

export function renderProcessUnits(units: ProcessTimelineUnit[]): ReactNode[] {
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
