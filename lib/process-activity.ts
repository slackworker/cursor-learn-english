/**
 * Cursor-like process nesting (from real Cursor chat alignment):
 *   Worked for …                (L0)
 *     Thought for …             (L1)
 *     Task card                 (L1)
 *     interim narration text    (L1)
 *     Explored N files …        (L1) — one fold until next narration/edit/shell
 *       Checked to-do list /
 *       Grepped … / Thought …   (L2, chronological)
 *       Explored available tools / Browser tabs / CDP …  (MCP → explore)
 *     interim narration text    (L1)
 *     Edited 3 files            (L1) — Thought splits edit batches
 *     Thought for …             (L1, sibling of Edited)
 *     Ran <command>             (L1, inline — not folded)
 *
 * Nesting rule: only `explore` activities may contain Thought.
 * Mid-explore Thoughts (brief or long) stay inside the open Explored fold;
 * do not split Explored on long Thought when more explore tools follow.
 * Edit / shell / other never nest Thought; shell is always an inline L1 line.
 * Phase-leading Thought before a text-only narration is L1. When narration
 * shares a step with explore tools (text → Read/Grep/…):
 *   - brief Thoughts (and earlier empty-phase Thoughts) stay L1 above the
 *     sentence — Cursor shows them as the first lines under Worked;
 *   - long Thoughts whose `phaseId` matches that step nest inside Explored
 *     (e.g. Thought for 6s under Explored after「我误删了…」).
 * Phase ids come from `flattenPhasesToUnits` — not flat-order heuristics.
 * After Shell/edit, leading Thoughts nest inside the next Explored fold.
 *
 * MCP: GetMcpTools + CallMcpTool nest inside Explored (not L1 tool-lines).
 * GetMcpTools counts as a search; browser_* CallMcpTool as browser actions.
 */

import type { TimelineThinking, TimelineTool } from "./dialogue-timeline";
import type { ProcessTimelineUnit } from "./interleave-transcript";
import type {
  TranscriptContentItem,
  TranscriptToolUseItem,
} from "./transcript-content";

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
    name === "FetchMcpResource" ||
    name === "GetMcpTools" ||
    name === "CallMcpTool"
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

function mcpToolName(input: Record<string, unknown>): string {
  return typeof input.toolName === "string" ? input.toolName : "";
}

function mcpArguments(
  input: Record<string, unknown>
): Record<string, unknown> {
  const args = input.arguments;
  if (args && typeof args === "object" && !Array.isArray(args)) {
    return args as Record<string, unknown>;
  }
  return {};
}

/** CallMcpTool against browser MCP (cursor-ide-browser / browser_*). */
export function isBrowserMcpCall(tool: TranscriptToolUseItem): boolean {
  if (tool.name !== "CallMcpTool") return false;
  const name = mcpToolName(tool.input);
  if (name.startsWith("browser_")) return true;
  return tool.input.server === "cursor-ide-browser";
}

function countExploreParts(tools: TranscriptToolUseItem[]): {
  files: number;
  searches: number;
  browserActions: number;
} {
  let files = 0;
  let searches = 0;
  let browserActions = 0;
  for (const tool of tools) {
    if (isExploreChromeTool(tool.name)) continue;
    if (tool.name === "GetMcpTools") {
      // Cursor: "Explored available tools" counts as a search.
      searches += 1;
      continue;
    }
    if (isBrowserMcpCall(tool)) {
      browserActions += 1;
      continue;
    }
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
      // Non-browser CallMcpTool / FetchMcpResource / etc.
      files += 1;
    }
  }
  return { files, searches, browserActions };
}

function exploreCountLabel(
  n: number,
  one: string,
  many: string
): string {
  return n === 1 ? `1 ${one}` : `${n} ${many}`;
}

export function summarizeActivity(
  kind: ActivityToolKind,
  tools: TranscriptToolUseItem[]
): string {
  if (kind === "explore") {
    const { files, searches, browserActions } = countExploreParts(tools);
    const tailParts: string[] = [];
    if (searches > 0) {
      tailParts.push(exploreCountLabel(searches, "search", "searches"));
    }
    if (browserActions > 0) {
      tailParts.push(
        exploreCountLabel(browserActions, "browser action", "browser actions")
      );
    }
    if (files === 1 && tailParts.length > 0) {
      const read = tools.find((t) => t.name === "Read");
      const path = typeof read?.input.path === "string" ? read.input.path : "";
      const base = path.split(/[/\\]/).pop();
      if (base) {
        return `Explored ${base}, ${tailParts.join(", ")}`;
      }
    }
    const parts: string[] = [];
    if (files > 0) {
      parts.push(exploreCountLabel(files, "file", "files"));
    }
    parts.push(...tailParts);
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

function truncateDisplay(text: string, max = 48): string {
  if (text.length <= max) return text;
  return `${text.slice(0, Math.max(0, max - 3))}...`;
}

function humanizeBrowserToolName(toolName: string): string {
  const rest = toolName.replace(/^browser_/, "").replace(/_/g, " ");
  if (!rest) return "Browser";
  return `Browser ${rest.charAt(0).toUpperCase()}${rest.slice(1)}`;
}

/** Cursor-friendly line for CallMcpTool / GetMcpTools. */
export function mcpActivityLine(tool: TranscriptToolUseItem): string | null {
  if (tool.name === "GetMcpTools") return "Explored available tools";
  if (tool.name !== "CallMcpTool") return null;

  const toolName = mcpToolName(tool.input);
  const args = mcpArguments(tool.input);

  if (toolName === "browser_tabs") return "Browser tabs";
  if (toolName === "browser_navigate") {
    const url = typeof args.url === "string" ? args.url.trim() : "";
    return url ? `Navigated to ${truncateDisplay(url)}` : "Navigated";
  }
  if (toolName === "browser_cdp") {
    const method = typeof args.method === "string" ? args.method.trim() : "";
    return method ? `CDP ${method}` : "CDP";
  }
  if (toolName === "browser_lock") {
    return args.action === "unlock" ? "Browser unlock" : "Browser lock";
  }
  if (toolName === "browser_snapshot") return "Browser snapshot";
  if (toolName === "browser_take_screenshot") return "Took screenshot";
  if (toolName === "browser_click") return "Browser click";
  if (toolName === "browser_type") return "Browser type";
  if (toolName === "browser_fill") return "Browser fill";
  if (toolName === "browser_scroll") return "Browser scroll";
  if (toolName === "browser_press_key") return "Browser key";
  if (toolName === "browser_select_option") return "Browser select";
  if (toolName === "browser_drag") return "Browser drag";
  if (toolName === "browser_highlight") return "Browser highlight";
  if (toolName === "browser_get_bounding_box") return "Browser bounding box";
  if (toolName === "browser_mouse_click_xy") return "Browser click";
  if (toolName === "mcp_auth") return "MCP auth";
  if (toolName.startsWith("browser_")) return humanizeBrowserToolName(toolName);
  return toolName || "MCP tool";
}

/** Cursor-style tool line inside an activity fold. */
export function toolActivityLine(tool: TranscriptToolUseItem): string {
  const mcpLine = mcpActivityLine(tool);
  if (mcpLine) return mcpLine;

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
  type PendingThought = {
    thinking: TimelineThinking;
    phaseId: number | undefined;
  };

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
  let pendingLong: PendingThought[] = [];
  /** Last thinking’s phase — hand-built units without phaseId inherit this. */
  let lastThinkingPhaseId: number | undefined;
  let nextSyntheticPhaseId = 0;
  /** Running TodoWrite list — needed for "Completed N of N to-dos". */
  const todoState = new Map<string, TodoEntry>();

  const emitThinkingL1 = (thinking: TimelineThinking) => {
    nodes.push({ kind: "thinking", thinking });
  };

  const flushPendingLongAsL1 = () => {
    for (const p of pendingLong) emitThinkingL1(p.thinking);
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
      if (kind === "explore") {
        // After Shell/edit, leading Thoughts nest inside the next Explored
        // (Cursor: Shell → Thought briefly → Explored available tools → …).
        state.open = {
          activityKind: kind,
          items: pendingLong.map((p) => ({
            kind: "thinking" as const,
            thinking: p.thinking,
          })),
          deferredLong: [],
        };
        pendingLong = [];
      } else {
        // Phase-leading Thought stays L1 above non-explore activities.
        flushPendingLongAsL1();
        state.open = {
          activityKind: kind,
          items: [],
          deferredLong: [],
        };
      }
    }
  };

  const stepRestOpensExplore = (
    items: TranscriptContentItem[],
    fromIdx: number
  ): boolean => {
    for (let i = fromIdx; i < items.length; i += 1) {
      const rest = items[i];
      if (rest.type !== "tool_use") continue;
      if (isSkippedProcessTool(rest.name)) continue;
      if (isExploreChromeTool(rest.name)) return true;
      if (classifyToolName(rest.name) === "explore") return true;
    }
    return false;
  };

  /**
   * For text → explore: keep long Thoughts that share this step’s phase to
   * nest inside Explored; lift briefs and earlier-phase Thoughts to L1 so
   * they stay above the narration (not buried under Explored after it).
   */
  const keepLongPendingForStepPhase = (stepPhaseId: number | undefined) => {
    if (stepPhaseId === undefined) {
      flushPendingLongAsL1();
      return;
    }
    const nest: PendingThought[] = [];
    for (const p of pendingLong) {
      if (p.phaseId === stepPhaseId && !isBriefThinking(p.thinking)) {
        nest.push(p);
      } else {
        emitThinkingL1(p.thinking);
      }
    }
    pendingLong = nest;
  };

  for (let ui = 0; ui < units.length; ui += 1) {
    const unit = units[ui];
    if (unit.kind === "thinking") {
      const exploreOpen =
        state.open && state.open.activityKind === "explore"
          ? state.open
          : null;
      // Cursor: once Explored is open, Thoughts nest inside until the next
      // L1 narration / edit / shell — including leading Thoughts placed into a
      // freshly opened fold (e.g. after Shell before the next GetMcpTools).
      if (exploreOpen) {
        exploreOpen.items.push({ kind: "thinking", thinking: unit.thinking });
        continue;
      }
      if (state.open) flush();
      const phaseId =
        unit.phaseId !== undefined ? unit.phaseId : nextSyntheticPhaseId++;
      lastThinkingPhaseId = phaseId;
      // Hold until text / shell / task / next Explored (do not emit L1 yet).
      pendingLong.push({ thinking: unit.thinking, phaseId });
      continue;
    }

    const stepPhaseId =
      unit.phaseId !== undefined ? unit.phaseId : lastThinkingPhaseId;
    const stepItems = unit.step.items;
    for (let ii = 0; ii < stepItems.length; ii += 1) {
      const item = stepItems[ii];
      if (item.type === "text") {
        flush();
        // Text-only narration: all pending Thoughts stay L1 above it.
        // Same step as explore tools (text → Read/…): nest only long Thoughts
        // that share this step’s phaseId; briefs stay L1 above the sentence.
        if (stepRestOpensExplore(stepItems, ii + 1)) {
          keepLongPendingForStepPhase(stepPhaseId);
        } else {
          flushPendingLongAsL1();
        }
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
