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

import type { TimelineThinking } from "../dialogue-timeline";
import type { ProcessTimelineUnit } from "../interleave-transcript";
import type {
  TranscriptContentItem,
  TranscriptToolUseItem,
} from "../transcript-content";
import {
  classifyToolName,
  isExploreChromeTool,
  isSkippedProcessTool,
} from "./classify";
import { isBriefThinking } from "./labels";
import { summarizeActivity } from "./summarize";
import { applyTodoWriteAndLabel } from "./tool-lines";
import type {
  ActivityToolKind,
  ProcessActivityItem,
  ProcessActivityNode,
} from "./types";

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

  type TodoEntry = { status: string };

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
      if (!hasNestedNonTool && toolItems.length === 1 && !onlyChrome) {
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
  const hasPriorL1Activity = () => nodes.some((n) => n.kind !== "thinking");

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
        samePhase && (!isBriefThinking(p.thinking) || nestBriefs);
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
