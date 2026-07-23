"use client";

import Link from "next/link";
import { Fragment, useContext, type ReactNode } from "react";
import {
  PROCESS_FOLD_CLASS,
  PROCESS_FOLD_CONTENT_CLASS,
  ProcessFoldSummary,
  TextWithTts,
} from "./fold";
import { TaskSubagentsContext } from "./context";
import { resolveTaskSubagent } from "@/lib/task-subagent";
import {
  isFileEditTool,
  toolUseLabel,
  type TranscriptAssistantStep,
  type TranscriptContentItem,
  type TranscriptToolUseItem,
} from "@/lib/transcript-content";

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

export function TranscriptToolUseChip({
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

export function buildTranscriptStepRows(
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

export function renderTranscriptRows(rows: TranscriptStepRow[]): ReactNode[] {
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
