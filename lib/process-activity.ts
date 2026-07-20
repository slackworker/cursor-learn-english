/**
 * Cursor-like process nesting (from real Cursor chat alignment):
 *   Worked for …                (L0)
 *     Thought for …             (L1)
 *     Task card                 (L1)
 *     interim narration text    (L1)
 *     Explored N files …        (L1) — fold when ≥2 tools or nested Thought/text
 *       Checked to-do list /
 *       Grepped … / Thought …   (L2, chronological)
 *       Explored available tools / Browser tabs / CDP …  (MCP → explore)
 *     Grepped … / Read …        (L1 tool-line) — lone explore tool, no nest
 *     interim narration text    (L1)
 *     ⚛ file.tsx +1 -1          (L1 edit card) — one component per file edit
 *     Thought for …             (L1, sibling of edits)
 *     >_ Format … node          (L1 Shell card) — expands to show command
 *                               (stdout not in hooks; command only)
 *
 * Nesting rule: only `explore` activities may contain Thought.
 * Mid-explore Thoughts (brief or long) stay inside the open Explored fold;
 * do not split Explored on long Thought when more explore tools follow.
 * Edit / shell / other never nest Thought; each edit is its own L1 card
 * (Cursor: "⚛ file.tsx +1 -1", not an "Edited N files" fold). Shell is L1.
 * Phase-leading Thought before a text-only narration is L1. When narration
 * shares a step with explore tools (text → Read/Grep/…):
 *   - at Worked start, brief Thoughts stay L1 above the sentence;
 *   - mid-session (after prior L1 activity), same-phase briefs nest in the
 *     next Explored (e.g.「上下文因页面重载…」under the following Explored);
 *   - long Thoughts whose `phaseId` matches that step nest inside Explored.
 * If a Thought’s phase pairs L1 narration with further explore tools, close
 * any open Explored first so it can join the next fold. Narration + edit
 * keeps the Thought as the trailing item of the current Explored.
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

function splitDiffLines(text: string): string[] {
  if (text === "") return [];
  return text.split("\n");
}

/**
 * Line add/delete counts via LCS — matches Cursor edit titles
 * (e.g. DialogueTimeline.tsx +1 -1, process-fold.css +54 -2).
 */
export function lineDiffStats(
  oldText: string,
  newText: string
): { plus: number; minus: number } {
  const a = splitDiffLines(oldText);
  const b = splitDiffLines(newText);
  const m = a.length;
  const n = b.length;
  if (m === 0 && n === 0) return { plus: 0, minus: 0 };
  // Cap DP size for huge Write payloads; fall back to full replace counts.
  if (m * n > 250_000) {
    return { plus: n, minus: m };
  }
  const prev = new Array<number>(n + 1).fill(0);
  const cur = new Array<number>(n + 1).fill(0);
  for (let i = 1; i <= m; i += 1) {
    cur[0] = 0;
    for (let j = 1; j <= n; j += 1) {
      cur[j] =
        a[i - 1] === b[j - 1]
          ? prev[j - 1] + 1
          : Math.max(prev[j], cur[j - 1]);
    }
    for (let j = 0; j <= n; j += 1) prev[j] = cur[j];
  }
  const lcs = prev[n];
  return { plus: n - lcs, minus: m - lcs };
}

export function editDiffStatsFromTool(
  tool: TranscriptToolUseItem
): { plus: number; minus: number } | null {
  const input = tool.input ?? {};
  if (tool.name === "StrReplace") {
    const oldS = typeof input.old_string === "string" ? input.old_string : null;
    const newS = typeof input.new_string === "string" ? input.new_string : null;
    if (oldS == null || newS == null) return null;
    return lineDiffStats(oldS, newS);
  }
  if (tool.name === "Write") {
    const contents =
      typeof input.contents === "string"
        ? input.contents
        : typeof input.content === "string"
          ? input.content
          : null;
    if (contents == null) return null;
    return { plus: splitDiffLines(contents).length, minus: 0 };
  }
  if (tool.name === "Delete") {
    return null;
  }
  return null;
}

/** Cursor file-type glyph before the edit basename. */
export function editFileIcon(path: string): string {
  const base = path.split(/[/\\]/).pop() ?? path;
  const dot = base.lastIndexOf(".");
  const ext = dot >= 0 ? base.slice(dot + 1).toLowerCase() : "";
  if (ext === "tsx" || ext === "jsx") return "⚛";
  if (ext === "css" || ext === "scss" || ext === "sass" || ext === "less") {
    return "#";
  }
  if (ext === "json" || ext === "jsonc") return "{}";
  if (ext === "md" || ext === "mdx") return "MD";
  if (
    ext === "ts" ||
    ext === "js" ||
    ext === "mjs" ||
    ext === "cjs" ||
    ext === "mts" ||
    ext === "cts"
  ) {
    return "JS";
  }
  return "·";
}

/** Cursor edit card title: "⚛ DialogueTimeline.tsx +1 -1". */
export function editActivityLine(tool: TranscriptToolUseItem): string {
  const path = typeof tool.input.path === "string" ? tool.input.path : "";
  const base = path.split(/[/\\]/).pop() || tool.name;
  const icon = editFileIcon(path || base);
  const stats = editDiffStatsFromTool(tool);
  if (stats) {
    return `${icon} ${base} +${stats.plus} -${stats.minus}`;
  }
  return `${icon} ${base}`;
}

export function isEditToolName(name: string): boolean {
  return (
    name === "Write" ||
    name === "StrReplace" ||
    name === "Delete" ||
    name === "EditNotebook"
  );
}

/** Changed lines for a compact Cursor-like edit preview. */
export function editDiffPreviewLines(
  tool: TranscriptToolUseItem
): { type: "add" | "del"; text: string }[] {
  const input = tool.input ?? {};
  if (tool.name === "StrReplace") {
    const oldS = typeof input.old_string === "string" ? input.old_string : "";
    const newS = typeof input.new_string === "string" ? input.new_string : "";
    const a = splitDiffLines(oldS);
    const b = splitDiffLines(newS);
    const m = a.length;
    const n = b.length;
    if (m * n > 250_000) {
      return [
        ...a.slice(0, 40).map((text) => ({ type: "del" as const, text })),
        ...b.slice(0, 40).map((text) => ({ type: "add" as const, text })),
      ];
    }
    // Backtrack LCS to emit only changed lines (order preserved).
    const dp: number[][] = Array.from({ length: m + 1 }, () =>
      new Array<number>(n + 1).fill(0)
    );
    for (let i = 1; i <= m; i += 1) {
      for (let j = 1; j <= n; j += 1) {
        dp[i][j] =
          a[i - 1] === b[j - 1]
            ? dp[i - 1][j - 1] + 1
            : Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
    const out: { type: "add" | "del"; text: string }[] = [];
    let i = m;
    let j = n;
    const stack: { type: "add" | "del"; text: string }[] = [];
    while (i > 0 || j > 0) {
      if (i > 0 && j > 0 && a[i - 1] === b[j - 1]) {
        i -= 1;
        j -= 1;
      } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
        stack.push({ type: "add", text: b[j - 1] });
        j -= 1;
      } else if (i > 0) {
        stack.push({ type: "del", text: a[i - 1] });
        i -= 1;
      }
    }
    for (let k = stack.length - 1; k >= 0; k -= 1) out.push(stack[k]);
    return out;
  }
  if (tool.name === "Write") {
    const contents =
      typeof input.contents === "string"
        ? input.contents
        : typeof input.content === "string"
          ? input.content
          : "";
    return splitDiffLines(contents)
      .slice(0, 80)
      .map((text) => ({ type: "add" as const, text }));
  }
  return [];
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
  if (tool.name === "Shell" || tool.name === "AwaitShell") {
    const desc =
      typeof input.description === "string" ? input.description.trim() : "";
    const cmd =
      typeof input.command === "string" ? input.command.trim() : "";
    // Cursor titles use Shell `description` (e.g. "Format collapse.css for
    // reading node") — not a truncated `node -e "` command prefix.
    if (desc) {
      const argv0 = cmd.split(/\s+/)[0]?.split(/[/\\]/).pop() ?? "";
      if (
        argv0 &&
        !desc.toLowerCase().split(/\s+/).includes(argv0.toLowerCase())
      ) {
        return `${desc} ${argv0}`;
      }
      return desc;
    }
    if (cmd) {
      const firstLine = cmd.split("\n")[0];
      return firstLine.length > 72
        ? `Ran ${firstLine.slice(0, 72)}…`
        : `Ran ${firstLine}`;
    }
  }
  if (isEditToolName(tool.name)) {
    return editActivityLine(tool);
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

function stepItemsOpenExplore(
  items: TranscriptContentItem[],
  fromIdx: number
): boolean {
  for (let i = fromIdx; i < items.length; i += 1) {
    const rest = items[i];
    if (rest.type !== "tool_use") continue;
    if (isSkippedProcessTool(rest.name)) continue;
    if (isExploreChromeTool(rest.name)) return true;
    if (classifyToolName(rest.name) === "explore") return true;
  }
  return false;
}

/**
 * Thought phase pairs with narration that continues into explore tools →
 * leave the open Explored (join the next one). Narration + edit/shell/end
 * keeps the Thought as the trailing item of the current Explored.
 */
function phaseNarrationOpensExploreAhead(
  units: ProcessTimelineUnit[],
  phaseId: number | undefined,
  fromIdx: number
): boolean {
  if (phaseId === undefined) return false;
  for (let i = fromIdx; i < units.length; i += 1) {
    const u = units[i];
    if (u.kind !== "step" || u.phaseId !== phaseId) continue;
    const items = u.step.items;
    for (let j = 0; j < items.length; j += 1) {
      if (items[j].type !== "text") continue;
      return stepItemsOpenExplore(items, j + 1);
    }
    return false;
  }
  return false;
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
      const toolItems = items.filter(
        (item): item is Extract<ProcessActivityItem, { kind: "tool" }> =>
          item.kind === "tool"
      );
      const tools = toolItems.map((item) => item.tool);
      const hasNestedNonTool = items.some((item) => item.kind !== "tool");
      const onlyChrome =
        toolItems.length > 0 &&
        toolItems.every((item) => isExploreChromeTool(item.tool.name));
      // Cursor (d77973b4): lone Grep with nothing nested is L1 "Grepped …"
      // under Worked — not a one-line "Explored 1 search" fold. Chrome-only
      // batches still use bare "Explored"; multi-tool / Thought keep the fold.
      if (
        !hasNestedNonTool &&
        toolItems.length === 1 &&
        !onlyChrome
      ) {
        nodes.push({ kind: "tool-line", tool: toolItems[0].tool });
      } else {
        nodes.push({
          kind: "activity",
          activityKind: "explore",
          summary: summarizeActivity("explore", tools),
          items,
        });
      }
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
  ): boolean => stepItemsOpenExplore(items, fromIdx);

  /** Already emitted non-Thought L1 (prior Explored / Shell / narration…). */
  const hasPriorL1Activity = () =>
    nodes.some((n) => n.kind !== "thinking");

  /**
   * For text → explore: nest same-phase Thoughts into Explored when mid-session
   * or when long; at Worked start, briefs stay L1 above the sentence.
   * Earlier-phase / empty-phase Thoughts always stay L1 above narration.
   */
  const keepLongPendingForStepPhase = (stepPhaseId: number | undefined) => {
    if (stepPhaseId === undefined) {
      flushPendingLongAsL1();
      return;
    }
    const nestBriefs = hasPriorL1Activity();
    const nest: PendingThought[] = [];
    for (const p of pendingLong) {
      const samePhase = p.phaseId === stepPhaseId;
      const nestThis =
        samePhase &&
        (!isBriefThinking(p.thinking) || nestBriefs);
      if (nestThis) {
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
      // Cursor: once Explored is open, mid-explore Thoughts nest inside —
      // unless this Thought’s phase pairs narration with further explore tools
      // (leave so it can join the following Explored). Narration+edit keeps it
      // as the trailing Thought of the current fold.
      if (exploreOpen) {
        if (phaseNarrationOpensExploreAhead(units, unit.phaseId, ui + 1)) {
          flush();
          const phaseId =
            unit.phaseId !== undefined ? unit.phaseId : nextSyntheticPhaseId++;
          lastThinkingPhaseId = phaseId;
          pendingLong.push({ thinking: unit.thinking, phaseId });
          continue;
        }
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
      if (cls === "edit" || cls === "shell" || cls === "other") {
        // Cursor: each file edit is its own L1 card (not "Edited N files").
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
