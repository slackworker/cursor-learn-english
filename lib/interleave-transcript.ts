import type { TimelineThinking, TimelineTool } from "./dialogue-timeline";
import type { TranscriptAssistantStep } from "./transcript-content";

/** One thinking block plus transcript steps that follow it in Cursor order. */
export type InterleavedTranscriptPhase = {
  thinking?: TimelineThinking;
  steps: TranscriptAssistantStep[];
};

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
 * (e.g. final reply). Matches interleaveByThinkingPhases in dialogue-timeline.
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
): InterleavedTranscriptPhase[] {
  if (steps.length === 0) {
    return thinking.map((t) => ({ thinking: t, steps: [] }));
  }
  if (thinking.length === 0) {
    return [{ steps }];
  }

  const sortedThinking = [...thinking].sort((a, b) =>
    a.timestamp.localeCompare(b.timestamp)
  );
  const hookAnchored = assignStepTimestamps(steps, tools);
  const { body, trailing, trailingFrom } = splitTrailingTextOnlySteps(steps, hookAnchored);
  const bodyHook = hookAnchored.slice(0, body.length);
  let bodyTs = fillStepTimestamps(bodyHook, body, bodyHook);

  if (!bodyTs.some(Boolean) && trailing.length === 0) {
    return interleaveByIndex(sortedThinking, steps);
  }

  const phases: InterleavedTranscriptPhase[] = [];
  let si = 0;

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
        if (tNext && ts > tNext) break;
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
    const lastThinkingPhase = [...phases].reverse().find((p) => p.thinking);
    if (lastThinkingPhase) {
      lastThinkingPhase.steps.push(...trailing);
    } else {
      phases.push({ steps: trailing });
    }
  }

  void trailingFrom;

  return phases;
}
