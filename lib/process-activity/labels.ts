import type { TimelineThinking, TimelineTool } from "../dialogue-timeline";
import type { ProcessTimelineUnit } from "../interleave-transcript";
import { BRIEF_THINKING_MS } from "./types";

function isBriefThinking(t: TimelineThinking): boolean {
  return t.duration_ms < BRIEF_THINKING_MS;
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

export { isBriefThinking };
