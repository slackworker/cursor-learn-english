/**
 * Cursor-like process nesting (from real Cursor chat alignment):
 *   Worked for …                (L0)
 *     Thought for …             (L1)
 *     Task card                 (L1)
 *     Explored N files …        (L1) — only explore nests Thought
 *       Grepped … / Thought …   (L2)
 *     Edited 3 files            (L1) — Thought splits edit batches
 *     Thought for …             (L1, sibling of Edited)
 *     Edited 2 files            (L1)
 *     Ran <command>             (L1, inline — not folded)
 *     Thought briefly           (L1, sibling of Ran)
 *
 * Nesting rule: only `explore` activities may contain Thought.
 * Edit / shell / other never nest Thought; shell is always an inline L1 line.
 */

import type { TimelineThinking, TimelineTool } from "./dialogue-timeline";
import type { ProcessTimelineUnit } from "./interleave-transcript";
import type { TranscriptToolUseItem } from "./transcript-content";

export const BRIEF_THINKING_MS = 100;

export type ActivityToolKind = "explore" | "edit" | "shell" | "other";

export type ProcessActivityItem =
  | { kind: "tool"; tool: TranscriptToolUseItem }
  | { kind: "thinking"; thinking: TimelineThinking }
  | { kind: "text"; text: string };

export type ProcessActivityNode =
  | { kind: "thinking"; thinking: TimelineThinking }
  | { kind: "task"; tool: TranscriptToolUseItem }
  /** Shell / misc tools shown inline under Worked (not an activity fold). */
  | { kind: "tool-line"; tool: TranscriptToolUseItem }
  | {
      kind: "activity";
      activityKind: ActivityToolKind;
      summary: string;
      items: ProcessActivityItem[];
    }
  | { kind: "text"; text: string; stepKey: string };

function isBriefThinking(t: TimelineThinking): boolean {
  return t.duration_ms < BRIEF_THINKING_MS;
}

export function classifyToolName(
  name: string
): "task" | ActivityToolKind {
  if (name === "Task") return "task";
  if (
    name === "Grep" ||
    name === "Glob" ||
    name === "SemanticSearch" ||
    name === "WebSearch" ||
    name === "WebFetch" ||
    name === "Read" ||
    name === "ReadLints" ||
    name === "FetchMcpResource"
  ) {
    return "explore";
  }
  if (
    name === "Write" ||
    name === "StrReplace" ||
    name === "Delete" ||
    name === "EditNotebook"
  ) {
    return "edit";
  }
  if (name === "Shell" || name === "AwaitShell") return "shell";
  return "other";
}

function countExploreParts(tools: TranscriptToolUseItem[]): {
  files: number;
  searches: number;
} {
  let files = 0;
  let searches = 0;
  for (const tool of tools) {
    if (
      tool.name === "Grep" ||
      tool.name === "Glob" ||
      tool.name === "SemanticSearch" ||
      tool.name === "WebSearch" ||
      tool.name === "WebFetch"
    ) {
      searches += 1;
    } else if (tool.name === "Read" || tool.name === "ReadLints") {
      files += 1;
    } else {
      files += 1;
    }
  }
  return { files, searches };
}

export function summarizeActivity(
  kind: ActivityToolKind,
  tools: TranscriptToolUseItem[]
): string {
  if (kind === "explore") {
    const { files, searches } = countExploreParts(tools);
    const parts: string[] = [];
    if (files > 0) {
      parts.push(files === 1 ? "1 file" : `${files} files`);
    }
    if (searches > 0) {
      parts.push(searches === 1 ? "1 search" : `${searches} searches`);
    }
    if (parts.length === 0) {
      return tools.length === 1 ? "Explored 1 item" : `Explored ${tools.length} items`;
    }
    return `Explored ${parts.join(", ")}`;
  }
  if (kind === "edit") {
    return tools.length === 1 ? "Edited 1 file" : `Edited ${tools.length} files`;
  }
  if (kind === "shell") {
    return tools.length === 1
      ? "Ran 1 command"
      : `Ran ${tools.length} commands`;
  }
  return tools.length === 1 ? "Used 1 tool" : `Used ${tools.length} tools`;
}

/** Cursor-style tool line inside an activity fold. */
export function toolActivityLine(tool: TranscriptToolUseItem): string {
  const input = tool.input;
  if (tool.name === "Grep" && typeof input.pattern === "string") {
    return `Grepped ${input.pattern}`;
  }
  if (tool.name === "Glob" && typeof input.glob_pattern === "string") {
    return `Searched files ${input.glob_pattern}`;
  }
  if (tool.name === "Read" && typeof input.path === "string") {
    return `Read ${input.path}`;
  }
  if (tool.name === "SemanticSearch" && typeof input.query === "string") {
    const q = input.query.trim();
    return q.length > 80 ? `Searched code ${q.slice(0, 80)}…` : `Searched code ${q}`;
  }
  if (tool.name === "WebSearch" && typeof input.search_term === "string") {
    return `Searched web ${input.search_term}`;
  }
  if (tool.name === "Shell" && typeof input.command === "string") {
    const cmd = input.command.trim().split("\n")[0];
    return cmd.length > 72 ? `Ran ${cmd.slice(0, 72)}…` : `Ran ${cmd}`;
  }
  if (
    (tool.name === "Write" ||
      tool.name === "StrReplace" ||
      tool.name === "Delete") &&
    typeof input.path === "string"
  ) {
    return `${tool.name} ${input.path}`;
  }
  if (tool.name === "Task" && typeof input.description === "string") {
    return input.description.trim() || "Task";
  }
  return tool.name;
}

export function formatDurationShort(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return "0s";
  if (ms < 1000) return `${Math.max(1, Math.round(ms / 1000))}s`;
  const totalSec = Math.round(ms / 1000);
  if (totalSec < 60) return `${totalSec}s`;
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return s > 0 ? `${m}m ${s}s` : `${m}m`;
}

export function thoughtFoldLabel(thinking: TimelineThinking): string {
  if (isBriefThinking(thinking)) return "Thought briefly";
  return `Thought for ${formatDurationShort(thinking.duration_ms)}`;
}

export function estimateWorkedMs(
  units: ProcessTimelineUnit[],
  tools?: TimelineTool[]
): number | null {
  const marks: number[] = [];
  for (const unit of units) {
    if (unit.kind !== "thinking") continue;
    const start = Date.parse(unit.thinking.timestamp);
    if (Number.isNaN(start)) continue;
    marks.push(start);
    marks.push(start + Math.max(0, unit.thinking.duration_ms || 0));
  }
  for (const tool of tools ?? []) {
    const start = Date.parse(tool.timestamp);
    if (Number.isNaN(start)) continue;
    marks.push(start);
    marks.push(start + Math.max(0, tool.duration || 0));
  }
  if (marks.length >= 2) {
    const span = Math.max(...marks) - Math.min(...marks);
    if (span > 0) return span;
  }
  const sum = units.reduce((acc, unit) => {
    if (unit.kind !== "thinking") return acc;
    return acc + Math.max(0, unit.thinking.duration_ms || 0);
  }, 0);
  return sum > 0 ? sum : null;
}

export function workedFoldSummary(
  units: ProcessTimelineUnit[],
  tools?: TimelineTool[]
): string {
  const ms = estimateWorkedMs(units, tools);
  if (ms != null && ms > 0) {
    return `Worked for ${formatDurationShort(ms)}`;
  }
  const thinkingCount = units.filter((u) => u.kind === "thinking").length;
  const toolCount = units.reduce((acc, unit) => {
    if (unit.kind !== "step") return acc;
    return (
      acc + unit.step.items.filter((item) => item.type === "tool_use").length
    );
  }, 0);
  const parts = ["过程"];
  if (thinkingCount > 0) {
    parts.push(
      thinkingCount === 1 ? "Thinking×1" : `Thinking×${thinkingCount}`
    );
  }
  if (toolCount > 0) {
    parts.push(toolCount === 1 ? "工具×1" : `工具×${toolCount}`);
  }
  return parts.join(" · ");
}

function lastActivityItemKind(
  items: ProcessActivityItem[]
): ProcessActivityItem["kind"] | null {
  if (items.length === 0) return null;
  return items[items.length - 1].kind;
}

/**
 * Build L1 process nodes from flat interleaved units.
 */
export function buildProcessActivityTree(
  units: ProcessTimelineUnit[]
): ProcessActivityNode[] {
  const nodes: ProcessActivityNode[] = [];
  let open: {
    activityKind: ActivityToolKind;
    items: ProcessActivityItem[];
  } | null = null;

  const flush = () => {
    if (!open || open.items.length === 0) {
      open = null;
      return;
    }
    const tools = open.items
      .filter(
        (item): item is Extract<ProcessActivityItem, { kind: "tool" }> =>
          item.kind === "tool"
      )
      .map((item) => item.tool);
    nodes.push({
      kind: "activity",
      activityKind: open.activityKind,
      summary: summarizeActivity(open.activityKind, tools),
      items: open.items,
    });
    open = null;
  };

  const ensureActivity = (kind: ActivityToolKind) => {
    if (open && open.activityKind !== kind) flush();
    if (!open) open = { activityKind: kind, items: [] };
  };

  /** Only explore folds nest Thought (Cursor: edit/shell stay siblings). */
  const shouldNestThinking = (thinking: TimelineThinking): boolean => {
    if (!open || open.activityKind !== "explore") return false;
    if (!open.items.some((item) => item.kind === "tool")) return false;
    const last = lastActivityItemKind(open.items);
    // Mid-batch: nest after a tool (brief or long, e.g. Thought for 16s).
    if (last === "tool") return true;
    // After a nested thought: only keep chaining brief ones.
    if (last === "thinking" && isBriefThinking(thinking)) return true;
    return false;
  };

  for (const unit of units) {
    if (unit.kind === "thinking") {
      if (shouldNestThinking(unit.thinking)) {
        open!.items.push({ kind: "thinking", thinking: unit.thinking });
        continue;
      }
      flush();
      nodes.push({ kind: "thinking", thinking: unit.thinking });
      continue;
    }

    for (const item of unit.step.items) {
      if (item.type === "text") {
        flush();
        nodes.push({
          kind: "text",
          text: item.text,
          stepKey: unit.stepKey,
        });
        continue;
      }

      const cls = classifyToolName(item.name);
      if (cls === "task") {
        flush();
        nodes.push({ kind: "task", tool: item });
        continue;
      }
      // Shell / other: Cursor shows these inline next to Thought, not folded.
      if (cls === "shell" || cls === "other") {
        flush();
        nodes.push({ kind: "tool-line", tool: item });
        continue;
      }

      ensureActivity(cls);
      open!.items.push({ kind: "tool", tool: item });
    }
  }

  flush();
  return nodes;
}
