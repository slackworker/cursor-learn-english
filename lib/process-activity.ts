/**
 * Cursor-like process nesting (from real Cursor chat alignment):
 *   Worked for …                (L0)
 *     Thought for …             (L1)
 *     Task card                 (L1)
 *     interim narration text    (L1)
 *     Explored N files …        (L1) — one fold until next narration/edit/shell
 *       Checked to-do list /
 *       Grepped … / Thought …   (L2, chronological)
 *     interim narration text    (L1)
 *     Edited 3 files            (L1) — Thought splits edit batches
 *     Thought for …             (L1, sibling of Edited)
 *     Ran <command>             (L1, inline — not folded)
 *
 * Nesting rule: only `explore` activities may contain Thought.
 * Mid-explore Thoughts (brief or long) stay inside the open Explored fold;
 * do not split Explored on long Thought when more explore tools follow.
 * Edit / shell / other never nest Thought; shell is always an inline L1 line.
 * Phase-leading Thought before L1 narration is always L1 (never deferred into
 * the following Explored fold).
 */

import type { TimelineThinking, TimelineTool } from "./dialogue-timeline";
import type { ProcessTimelineUnit } from "./interleave-transcript";
import type { TranscriptToolUseItem } from "./transcript-content";

export const BRIEF_THINKING_MS = 100;

export type ActivityToolKind = "explore" | "edit" | "shell" | "other";

export type ProcessActivityItem =
  | {
      kind: "tool";
      tool: TranscriptToolUseItem;
      stepKey?: string;
      /** Precomputed Cursor label (e.g. TodoWrite → Completed N of N). */
      line?: string;
    }
  | { kind: "thinking"; thinking: TimelineThinking }
  | { kind: "text"; text: string };

/** UI-chrome tools Cursor does not put in Explored / Ran folds. */
const SKIP_PROCESS_TOOLS = new Set([
  "AskQuestion",
  "SwitchMode",
  "GenerateImage",
]);

/** Shown inside Explored (does not count toward files/searches). */
function isExploreChromeTool(name: string): boolean {
  return name === "TodoWrite";
}

export function isSkippedProcessTool(name: string): boolean {
  return SKIP_PROCESS_TOOLS.has(name);
}

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
    if (isExploreChromeTool(tool.name)) continue;
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
    if (files === 1 && searches > 0) {
      const read = tools.find((t) => t.name === "Read");
      const path = typeof read?.input.path === "string" ? read.input.path : "";
      const base = path.split(/[/\\]/).pop();
      if (base) {
        const searchLabel =
          searches === 1 ? "1 search" : `${searches} searches`;
        return `Explored ${base}, ${searchLabel}`;
      }
    }
    const parts: string[] = [];
    if (files > 0) {
      parts.push(files === 1 ? "1 file" : `${files} files`);
    }
    if (searches > 0) {
      parts.push(searches === 1 ? "1 search" : `${searches} searches`);
    }
    if (parts.length === 0) {
      // TodoWrite-only (or other chrome) folds: Cursor shows bare "Explored".
      return "Explored";
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
  if (tool.name === "TodoWrite") {
    return "Checked to-do list";
  }
  return tool.name;
}

type TodoEntry = { status: string };

/**
 * Apply a TodoWrite to running list state and return the Cursor activity line.
 * merge:false replaces the list; merge:true patches by id.
 * When every known todo is completed → "Completed N of N to-dos".
 */
export function applyTodoWriteAndLabel(
  state: Map<string, TodoEntry>,
  tool: TranscriptToolUseItem
): string {
  const input = tool.input ?? {};
  const todos = Array.isArray(input.todos) ? input.todos : [];
  if (input.merge !== true) {
    state.clear();
  }
  for (const raw of todos) {
    if (!raw || typeof raw !== "object") continue;
    const rec = raw as Record<string, unknown>;
    if (typeof rec.id !== "string") continue;
    const prev = state.get(rec.id);
    const status =
      typeof rec.status === "string"
        ? rec.status
        : prev?.status ?? "pending";
    state.set(rec.id, { status });
  }
  const all = [...state.values()];
  const completed = all.filter((t) => t.status === "completed").length;
  if (all.length > 0 && completed === all.length) {
    return `Completed ${completed} of ${all.length} to-dos`;
  }
  return "Checked to-do list";
}

/** Prefer precomputed line (TodoWrite state) when present. */
export function activityItemLine(
  item: Extract<ProcessActivityItem, { kind: "tool" }>
): string {
  return item.line ?? toolActivityLine(item.tool);
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

/**
 * Hook capture timestamps are completion times (`afterAgentThought` /
 * `postToolUse`). Subtract duration so the wall-clock span matches Cursor.
 */
export function estimateWorkedMs(
  units: ProcessTimelineUnit[],
  tools?: TimelineTool[]
): number | null {
  const marks: number[] = [];
  for (const unit of units) {
    if (unit.kind !== "thinking") continue;
    const end = Date.parse(unit.thinking.timestamp);
    if (Number.isNaN(end)) continue;
    const duration = Math.max(0, unit.thinking.duration_ms || 0);
    marks.push(end - duration);
    marks.push(end);
  }
  for (const tool of tools ?? []) {
    const end = Date.parse(tool.timestamp);
    if (Number.isNaN(end)) continue;
    const duration = Math.max(0, tool.duration || 0);
    marks.push(end - duration);
    marks.push(end);
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

/**
 * Cursor explore folds keep chronological tool/thinking order. Phase-leading
 * longs that were deferred into this fold (no intervening L1 narration) append
 * as trailing Thought. Extra spill is unused — mid-explore longs all nest.
 */
function finalizeExploreItems(
  items: ProcessActivityItem[],
  deferredLong: TimelineThinking[]
): { items: ProcessActivityItem[]; spillThinking: TimelineThinking[] } {
  const out: ProcessActivityItem[] = [...items];
  for (const t of deferredLong) {
    out.push({ kind: "thinking", thinking: t });
  }
  return { items: out, spillThinking: [] };
}

/**
 * Build L1 process nodes from flat interleaved units.
 */
export function buildProcessActivityTree(
  units: ProcessTimelineUnit[]
): ProcessActivityNode[] {
  type OpenActivity = {
    activityKind: ActivityToolKind;
    items: ProcessActivityItem[];
    /** Phase-leading longs held until an explore fold can take them. */
    deferredLong: TimelineThinking[];
  };

  const nodes: ProcessActivityNode[] = [];
  // Use a box so closures (flush) do not poison control-flow narrowing of `open`.
  const state: { open: OpenActivity | null } = { open: null };
  /** Thinking before the next explore fold (not yet L1). */
  let pendingLong: TimelineThinking[] = [];
  /** Running TodoWrite list — needed for "Completed N of N to-dos". */
  const todoState = new Map<string, TodoEntry>();

  const emitThinkingL1 = (thinking: TimelineThinking) => {
    nodes.push({ kind: "thinking", thinking });
  };

  const flushPendingLongAsL1 = () => {
    for (const t of pendingLong) emitThinkingL1(t);
    pendingLong = [];
  };

  const pushToolItem = (
    tool: TranscriptToolUseItem,
    stepKey: string | undefined
  ) => {
    const line =
      tool.name === "TodoWrite"
        ? applyTodoWriteAndLabel(todoState, tool)
        : undefined;
    state.open!.items.push({
      kind: "tool",
      tool,
      stepKey,
      line,
    });
  };

  const flush = () => {
    const open = state.open;
    if (!open || open.items.length === 0) {
      if (open?.deferredLong.length) {
        for (const t of open.deferredLong) emitThinkingL1(t);
      }
      state.open = null;
      return;
    }

    if (open.activityKind === "explore") {
      const { items, spillThinking } = finalizeExploreItems(
        open.items,
        open.deferredLong
      );
      const tools = items
        .filter(
          (item): item is Extract<ProcessActivityItem, { kind: "tool" }> =>
            item.kind === "tool"
        )
        .map((item) => item.tool);
      nodes.push({
        kind: "activity",
        activityKind: "explore",
        summary: summarizeActivity("explore", tools),
        items,
      });
      for (const t of spillThinking) emitThinkingL1(t);
    } else {
      const tools = open.items
        .filter(
          (item): item is Extract<ProcessActivityItem, { kind: "tool" }> =>
            item.kind === "tool"
        )
        .map((item) => item.tool);
      const onlyTools = open.items.filter((item) => item.kind === "tool");
      for (const item of open.items) {
        if (item.kind === "thinking") emitThinkingL1(item.thinking);
      }
      nodes.push({
        kind: "activity",
        activityKind: open.activityKind,
        summary: summarizeActivity(open.activityKind, tools),
        items: onlyTools,
      });
      for (const t of open.deferredLong) emitThinkingL1(t);
    }
    state.open = null;
  };

  const ensureActivity = (kind: ActivityToolKind) => {
    if (state.open && state.open.activityKind !== kind) flush();
    if (!state.open) {
      // Phase-leading Thought stays L1 above the new activity (Cursor:
      // Thought → text → Explored, or Thought → Explored).
      flushPendingLongAsL1();
      state.open = {
        activityKind: kind,
        items: [],
        deferredLong: [],
      };
    }
  };

  for (let ui = 0; ui < units.length; ui += 1) {
    const unit = units[ui];
    if (unit.kind === "thinking") {
      const exploreOpen =
        state.open && state.open.activityKind === "explore"
          ? state.open
          : null;
      // Cursor: once Explored is open (Read/Grep or TodoWrite), Thoughts nest
      // inside until the next L1 narration / edit / shell.
      if (exploreOpen && exploreOpen.items.some((item) => item.kind === "tool")) {
        exploreOpen.items.push({ kind: "thinking", thinking: unit.thinking });
        continue;
      }
      if (state.open) flush();
      if (isBriefThinking(unit.thinking)) {
        flushPendingLongAsL1();
        emitThinkingL1(unit.thinking);
      } else {
        pendingLong.push(unit.thinking);
      }
      continue;
    }

    const stepItems = unit.step.items;
    for (let ii = 0; ii < stepItems.length; ii += 1) {
      const item = stepItems[ii];
      if (item.type === "text") {
        flush();
        // Phase-leading Thought stays L1 above narration, even when explore
        // tools follow in the same step (Cursor: Thought → text → Explored).
        flushPendingLongAsL1();
        nodes.push({
          kind: "text",
          text: item.text,
          stepKey: unit.stepKey,
        });
        continue;
      }

      if (isSkippedProcessTool(item.name)) {
        continue;
      }

      if (isExploreChromeTool(item.name)) {
        ensureActivity("explore");
        pushToolItem(item, unit.stepKey);
        continue;
      }

      const cls = classifyToolName(item.name);
      if (cls === "task") {
        flush();
        flushPendingLongAsL1();
        nodes.push({ kind: "task", tool: item });
        continue;
      }
      if (cls === "shell" || cls === "other") {
        flush();
        flushPendingLongAsL1();
        nodes.push({ kind: "tool-line", tool: item });
        continue;
      }

      ensureActivity(cls);
      pushToolItem(item, unit.stepKey);
    }
  }

  flush();
  flushPendingLongAsL1();
  return nodes;
}
