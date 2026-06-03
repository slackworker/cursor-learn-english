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

function fillStepTimestamps(
  stepTs: (string | undefined)[],
  steps: TranscriptAssistantStep[]
): (string | undefined)[] {
  const filled = [...stepTs];
  // Only backward-fill gaps (next known anchor), never forward-fill early ts onto later steps.
  for (let i = filled.length - 2; i >= 0; i -= 1) {
    if (filled[i]) continue;
    for (let j = i + 1; j < filled.length; j += 1) {
      if (filled[j]) {
        filled[i] = filled[j];
        break;
      }
    }
  }
  let lastToolIdx = -1;
  for (let i = filled.length - 1; i >= 0; i -= 1) {
    if (filled[i] && stepToolNames(steps[i]).length > 0) {
      lastToolIdx = i;
      break;
    }
  }
  if (lastToolIdx >= 0) {
    for (let i = lastToolIdx + 1; i < filled.length; i += 1) {
      if (!filled[i]) filled[i] = filled[lastToolIdx];
    }
  }
  return filled;
}

/**
 * Cursor order per turn: optional steps before first thinking,
 * then (thinking → steps)*, then optional tail (e.g. final reply).
 */
function interleaveByIndex(
  sortedThinking: TimelineThinking[],
  steps: TranscriptAssistantStep[]
): InterleavedTranscriptPhase[] {
  const phases: InterleavedTranscriptPhase[] = [];
  const lead = Math.max(0, steps.length - sortedThinking.length);
  if (lead > 0) phases.push({ steps: steps.slice(0, lead) });

  let si = lead;
  for (let ti = 0; ti < sortedThinking.length; ti += 1) {
    const chunk: TranscriptAssistantStep[] = [];
    if (si < steps.length) {
      chunk.push(steps[si]);
      si += 1;
    }
    phases.push({ thinking: sortedThinking[ti], steps: chunk });
  }
  if (si < steps.length) phases.push({ steps: steps.slice(si) });
  return phases;
}

export function buildInterleavedTranscriptPhases(
  thinking: TimelineThinking[],
  steps: TranscriptAssistantStep[],
  tools: TimelineTool[]
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
  const stepTs = fillStepTimestamps(assignStepTimestamps(steps, tools), steps);
  if (!stepTs.some(Boolean)) {
    return interleaveByIndex(sortedThinking, steps);
  }

  const phases: InterleavedTranscriptPhase[] = [];
  let si = 0;

  const prefix: TranscriptAssistantStep[] = [];
  while (si < steps.length) {
    const ts = stepTs[si];
    if (ts && ts < sortedThinking[0].timestamp) {
      prefix.push(steps[si]);
      si += 1;
    } else break;
  }
  if (prefix.length > 0) phases.push({ steps: prefix });

  for (let ti = 0; ti < sortedThinking.length; ti += 1) {
    const tCur = sortedThinking[ti].timestamp;
    const tNext = sortedThinking[ti + 1]?.timestamp;
    const chunk: TranscriptAssistantStep[] = [];

    while (si < steps.length) {
      const ts = stepTs[si];
      if (ts) {
        if (ts < tCur) break;
        if (tNext && ts >= tNext) break;
        chunk.push(steps[si]);
        si += 1;
        continue;
      }
      const stepsLeft = steps.length - si;
      const thinkLeft = sortedThinking.length - ti;
      if (stepsLeft > thinkLeft) {
        chunk.push(steps[si]);
        si += 1;
      } else break;
    }

    phases.push({ thinking: sortedThinking[ti], steps: chunk });
  }

  if (si < steps.length) {
    phases.push({ steps: steps.slice(si) });
  }

  return phases;
}
