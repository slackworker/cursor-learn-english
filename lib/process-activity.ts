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
  | { kind: "tool"; tool: TranscriptToolUseItem; stepKey?: string }
  | { kind: "thinking"; thinking: TimelineThinking }
  | { kind: "text"; text: string };

/** UI-chrome tools Cursor does not put in Explored / Ran folds. */
const SKIP_PROCESS_TOOLS = new Set([
  "AskQuestion",
  "TodoWrite",
  "SwitchMode",
  "GenerateImage",
]);

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

/**
 * Cursor explore folds: tool batches by transcript step, brief thoughts between
 * batches, long thoughts (including deferred phase-leading ones) at the end.
 * Extra nested longs after the first trailing long are returned for L1.
 */
function finalizeExploreItems(
  items: ProcessActivityItem[],
  deferredLong: TimelineThinking[]
): { items: ProcessActivityItem[]; spillThinking: TimelineThinking[] } {
  const toolItems: Extract<ProcessActivityItem, { kind: "tool" }>[] = [];
  const briefThoughts: TimelineThinking[] = [];
  const nestedLongs: TimelineThinking[] = [];

  for (const item of items) {
    if (item.kind === "tool") toolItems.push(item);
    else if (item.kind === "thinking") {
      if (isBriefThinking(item.thinking)) briefThoughts.push(item.thinking);
      else nestedLongs.push(item.thinking);
    }
  }

  const groups: Extract<ProcessActivityItem, { kind: "tool" }>[][] = [];
  for (const tool of toolItems) {
    const prev = groups[groups.length - 1];
    const prevKey = prev?.[0]?.stepKey;
    if (
      prev &&
      ((tool.stepKey != null && prevKey === tool.stepKey) ||
        (tool.stepKey == null && prevKey == null))
    ) {
      prev.push(tool);
    } else {
      groups.push([tool]);
    }
  }

  const out: ProcessActivityItem[] = [];
  let briefIdx = 0;
  for (let gi = 0; gi < groups.length; gi += 1) {
    out.push(...groups[gi]);
    const isLast = gi === groups.length - 1;
    if (!isLast && briefIdx < briefThoughts.length) {
      out.push({ kind: "thinking", thinking: briefThoughts[briefIdx] });
      briefIdx += 1;
    }
  }
  while (briefIdx < briefThoughts.length) {
    out.push({ kind: "thinking", thinking: briefThoughts[briefIdx] });
    briefIdx += 1;
  }

  // Prefer phase-leading deferred long as the single trailing Thought in the fold.
  const trailingLong = deferredLong[0] ?? nestedLongs[0];
  const spillThinking: TimelineThinking[] = [];
  if (trailingLong) {
    out.push({ kind: "thinking", thinking: trailingLong });
  }
  for (const t of deferredLong) {
    if (t !== trailingLong) spillThinking.push(t);
  }
  for (const t of nestedLongs) {
    if (t !== trailingLong) spillThinking.push(t);
  }

  return { items: out, spillThinking };
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

  const emitThinkingL1 = (thinking: TimelineThinking) => {
    nodes.push({ kind: "thinking", thinking });
  };

  const flushPendingLongAsL1 = () => {
    for (const t of pendingLong) emitThinkingL1(t);
    pendingLong = [];
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
      state.open = {
        activityKind: kind,
        items: [],
        deferredLong: kind === "explore" ? pendingLong.splice(0) : [],
      };
      if (kind !== "explore") flushPendingLongAsL1();
    } else if (
      kind === "explore" &&
      pendingLong.length > 0 &&
      state.open.deferredLong.length === 0
    ) {
      state.open.deferredLong.push(...pendingLong.splice(0));
    }
  };

  const remainingHasExploreTool = (fromUnitIdx: number): boolean => {
    for (let ui = fromUnitIdx; ui < units.length; ui += 1) {
      const u = units[ui];
      if (u.kind !== "step") continue;
      for (const it of u.step.items) {
        if (it.type !== "tool_use") continue;
        if (isSkippedProcessTool(it.name)) continue;
        const cls = classifyToolName(it.name);
        if (cls === "explore") return true;
        if (cls === "edit" || cls === "shell" || cls === "task") return false;
      }
    }
    return false;
  };

  for (let ui = 0; ui < units.length; ui += 1) {
    const unit = units[ui];
    if (unit.kind === "thinking") {
      const exploreOpen =
        state.open && state.open.activityKind === "explore"
          ? state.open
          : null;
      if (exploreOpen && exploreOpen.items.some((item) => item.kind === "tool")) {
        if (isBriefThinking(unit.thinking)) {
          exploreOpen.items.push({ kind: "thinking", thinking: unit.thinking });
        } else if (remainingHasExploreTool(ui + 1)) {
          flush();
          pendingLong.push(unit.thinking);
        } else {
          exploreOpen.deferredLong.push(unit.thinking);
          flush();
        }
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
        const restHasExplore = stepItems
          .slice(ii + 1)
          .some(
            (rest) =>
              rest.type === "tool_use" &&
              !isSkippedProcessTool(rest.name) &&
              classifyToolName(rest.name) === "explore"
          );
        if (!restHasExplore) flushPendingLongAsL1();
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
      state.open!.items.push({
        kind: "tool",
        tool: item,
        stepKey: unit.stepKey,
      });
    }
  }

  flush();
  flushPendingLongAsL1();
  return nodes;
}
