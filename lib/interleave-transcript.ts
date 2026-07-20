import type { TimelineThinking, TimelineTool } from "./dialogue-timeline";
import { findProcessFinalSplitIndex } from "./process-fold";
import type { TranscriptAssistantStep } from "./transcript-content";

/** One thinking block plus transcript steps that follow it in Cursor order. */
export type InterleavedTranscriptPhase = {
  thinking?: TimelineThinking;
  steps: TranscriptAssistantStep[];
};

/** Flat timeline unit used to mirror Cursor’s process fold vs final reply. */
export type ProcessTimelineUnit =
  | { kind: "thinking"; thinking: TimelineThinking }
  | { kind: "step"; step: TranscriptAssistantStep; stepKey: string };

function stepHasToolUse(step: TranscriptAssistantStep): boolean {
  return step.items.some((item) => item.type === "tool_use");
}

function unitFoldKind(unit: ProcessTimelineUnit): "thinking" | "tool" | "response" {
  if (unit.kind === "thinking") return "thinking";
  return stepHasToolUse(unit.step) ? "tool" : "response";
}

/**
 * Cursor folds interim narration + tools under one “process” section;
 * only content after the last tool_use stays expanded as the formal reply.
 * Post-reply thinking stays in `final` (not folded back into process).
 */
export function splitProcessAndFinalUnits(
  units: ProcessTimelineUnit[]
): {
  process: ProcessTimelineUnit[];
  final: ProcessTimelineUnit[];
  /** @deprecated use `final` — kept for call sites that only need steps */
  finalSteps: { step: TranscriptAssistantStep; stepKey: string }[];
} {
  if (units.length === 0) {
    return { process: [], final: [], finalSteps: [] };
  }

  const end = findProcessFinalSplitIndex(units.map(unitFoldKind));
  let process = units.slice(0, end);
  let final = units.slice(end);

  // If the last process unit mixes tools then trailing text, peel text after last tool_use.
  const last = process[process.length - 1];
  if (last?.kind === "step") {
    const items = last.step.items;
    let lastToolItemIdx = -1;
    for (let i = 0; i < items.length; i += 1) {
      if (items[i].type === "tool_use") lastToolItemIdx = i;
    }
    if (lastToolItemIdx >= 0 && lastToolItemIdx < items.length - 1) {
      const head = items.slice(0, lastToolItemIdx + 1);
      const tail = items.slice(lastToolItemIdx + 1);
      if (tail.every((item) => item.type === "text")) {
        process = [
          ...process.slice(0, -1),
          {
            kind: "step",
            stepKey: last.stepKey,
            step: { items: head },
          },
        ];
        final = [
          {
            kind: "step",
            stepKey: `${last.stepKey}-final`,
            step: { items: tail },
          },
          ...final,
        ];
      }
    }
  }

  const finalSteps = final
    .filter((u): u is Extract<ProcessTimelineUnit, { kind: "step" }> => u.kind === "step")
    .map((u) => ({ step: u.step, stepKey: u.stepKey }));

  return { process, final, finalSteps };
}

export function flattenPhasesToUnits(
  phases: InterleavedTranscriptPhase[]
): ProcessTimelineUnit[] {
  const units: ProcessTimelineUnit[] = [];
  phases.forEach((phase, phaseIdx) => {
    if (phase.thinking) {
      units.push({ kind: "thinking", thinking: phase.thinking });
    }
    phase.steps.forEach((step, stepIdx) => {
      units.push({
        kind: "step",
        step,
        stepKey: `phase-${phaseIdx}-step-${stepIdx}`,
      });
    });
  });
  return units;
}

const TOOLS_WITHOUT_HOOK = new Set([
  "TodoWrite",
  "ReadLints",
  "Task",
  "SwitchMode",
  "AskQuestion",
  "GenerateImage",
]);

/** Hooks often log Write while transcript says StrReplace. */
function hookToolName(name: string): string {
  if (name === "StrReplace" || name === "Delete") return "Write";
  return name;
}

function stepToolNames(step: TranscriptAssistantStep): string[] {
  return step.items
    .filter((i) => i.type === "tool_use")
    .map((i) => hookToolName(i.name));
}

/**
 * Map each transcript step to the earliest matching postToolUse timestamp
 * in hook event order (same turn window).
 */
export function assignStepTimestamps(
  steps: TranscriptAssistantStep[],
  tools: TimelineTool[]
): (string | undefined)[] {
  const sorted = [...tools]
    .filter((t) => t.event_type === "postToolUse")
    .sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  let ei = 0;

  return steps.map((step) => {
    let ts: string | undefined;
    for (const name of stepToolNames(step)) {
      if (TOOLS_WITHOUT_HOOK.has(name)) continue;
      for (let j = ei; j < sorted.length; j += 1) {
        const evName = hookToolName(sorted[j].tool_name || "");
        if (evName !== name) continue;
        ts = ts ?? sorted[j].timestamp;
        ei = j + 1;
        break;
      }
    }
    return ts;
  });
}

function isTextOnlyStep(step: TranscriptAssistantStep): boolean {
  return step.items.length > 0 && step.items.every((i) => i.type === "text");
}

/** Trailing assistant replies (text-only, no postToolUse) — attach after last thinking. */
function splitTrailingTextOnlySteps(
  steps: TranscriptAssistantStep[],
  hookAnchored: (string | undefined)[]
): { body: TranscriptAssistantStep[]; trailing: TranscriptAssistantStep[]; trailingFrom: number } {
  let splitAt = steps.length;
  while (splitAt > 0) {
    const i = splitAt - 1;
    if (!isTextOnlyStep(steps[i]) || hookAnchored[i]) break;
    splitAt = i;
  }
  return {
    body: steps.slice(0, splitAt),
    trailing: steps.slice(splitAt),
    trailingFrom: splitAt,
  };
}

function fillStepTimestamps(
  stepTs: (string | undefined)[],
  steps: TranscriptAssistantStep[],
  hookAnchored: (string | undefined)[]
): (string | undefined)[] {
  const filled = [...stepTs];
  // Forward-fill only non-text-only gaps after the last tool anchor.
  let lastToolIdx = -1;
  for (let i = filled.length - 1; i >= 0; i -= 1) {
    if (filled[i] && stepToolNames(steps[i]).length > 0) {
      lastToolIdx = i;
      break;
    }
  }
  if (lastToolIdx >= 0) {
    for (let i = lastToolIdx + 1; i < filled.length; i += 1) {
      if (filled[i]) continue;
      if (isTextOnlyStep(steps[i]) && !hookAnchored[i]) continue;
      filled[i] = filled[lastToolIdx];
    }
  }
  return filled;
}

/**
 * Cursor order per turn: (thinking → step)*, then optional tail steps
 * (e.g. final reply), then thinking that landed after the formal reply.
 * Matches interleaveByThinkingPhases in dialogue-timeline.
 */
function interleaveByIndex(
  sortedThinking: TimelineThinking[],
  steps: TranscriptAssistantStep[]
): InterleavedTranscriptPhase[] {
  const phases: InterleavedTranscriptPhase[] = [];
  for (let ti = 0; ti < sortedThinking.length; ti += 1) {
    const chunk: TranscriptAssistantStep[] = [];
    if (ti < steps.length) chunk.push(steps[ti]);
    phases.push({ thinking: sortedThinking[ti], steps: chunk });
  }
  if (steps.length > sortedThinking.length) {
    phases.push({ steps: steps.slice(sortedThinking.length) });
  }
  return phases;
}

export function buildInterleavedTranscriptPhases(
  thinking: TimelineThinking[],
  steps: TranscriptAssistantStep[],
  tools: TimelineTool[],
  options?: { replyAfterTimestamp?: string }
): InterleavedTranscriptPhase[] {
  if (steps.length === 0) {
    return thinking.map((t) => ({ thinking: t, steps: [] }));
  }
  if (thinking.length === 0) {
    return [{ steps }];
  }

  const replyTs = options?.replyAfterTimestamp;
  const sortedAll = [...thinking].sort((a, b) =>
    a.timestamp.localeCompare(b.timestamp)
  );
  const sortedThinking = replyTs
    ? sortedAll.filter((t) => t.timestamp <= replyTs)
    : sortedAll;
  const postReplyThinking = replyTs
    ? sortedAll.filter((t) => t.timestamp > replyTs)
    : [];

  const hookAnchored = assignStepTimestamps(steps, tools);
  const { body, trailing, trailingFrom } = splitTrailingTextOnlySteps(steps, hookAnchored);
  const bodyHook = hookAnchored.slice(0, body.length);
  let bodyTs = fillStepTimestamps(bodyHook, body, bodyHook);

  if (!bodyTs.some(Boolean) && trailing.length === 0) {
    const phases = interleaveByIndex(sortedThinking, steps);
    for (const t of postReplyThinking) phases.push({ thinking: t, steps: [] });
    return phases;
  }

  const phases: InterleavedTranscriptPhase[] = [];
  let si = 0;

  if (sortedThinking.length === 0) {
    if (body.length > 0) phases.push({ steps: body });
    if (trailing.length > 0) phases.push({ steps: trailing });
    for (const t of postReplyThinking) phases.push({ thinking: t, steps: [] });
    void trailingFrom;
    return phases;
  }

  const prefix: TranscriptAssistantStep[] = [];
  while (si < body.length) {
    const ts = bodyTs[si];
    if (ts && ts < sortedThinking[0].timestamp) {
      prefix.push(body[si]);
      si += 1;
    } else break;
  }
  if (prefix.length > 0) phases.push({ steps: prefix });

  for (let ti = 0; ti < sortedThinking.length; ti += 1) {
    const tCur = sortedThinking[ti].timestamp;
    const tNext = sortedThinking[ti + 1]?.timestamp;
    const chunk: TranscriptAssistantStep[] = [];

    while (si < body.length) {
      const ts = bodyTs[si];
      if (ts) {
        if (ts < tCur) break;
        // Same-ms tools belong with the next thinking (Cursor: Thought then tools).
        // Using `>` leaked those tools into the previous phase and pushed the next
        // Thought after them — e.g. 3 Reads before "Thought briefly", then
        // "Thought for 16s" stranded at L1.
        if (tNext && ts >= tNext) break;
        chunk.push(body[si]);
        si += 1;
        continue;
      }
      const stepsLeft = body.length - si;
      const thinkLeft = sortedThinking.length - ti;
      if (stepsLeft > thinkLeft) {
        chunk.push(body[si]);
        si += 1;
      } else break;
    }

    phases.push({ thinking: sortedThinking[ti], steps: chunk });
  }

  if (si < body.length) {
    phases.push({ steps: body.slice(si) });
  }

  if (trailing.length > 0) {
    phases.push({ steps: trailing });
  }
  for (const t of postReplyThinking) {
    phases.push({ thinking: t, steps: [] });
  }

  void trailingFrom;

  return phases;
}
