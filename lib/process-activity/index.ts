/**
 * Cursor-like process activity domain (nesting tree + labels).
 *
 * Module map (edit the smallest file that owns the concern):
 * - types.ts      node/item types + BRIEF_THINKING_MS
 * - classify.ts   tool kind routing (explore/edit/shell/task) + MCP detect
 * - summarize.ts  "Explored N files…" fold titles
 * - edit-diff.ts  LCS diff stats, edit card title/preview
 * - tool-lines.ts Grepped/Read/Shell/MCP/TodoWrite activity lines
 * - labels.ts     Thought / Worked duration labels
 * - tree.ts       buildProcessActivityTree (nesting rules live here)
 *
 * UI rendering: components/dialogue-timeline/process-activity-views.tsx
 * Regression: npx --yes tsx scripts/verify-process-activity.ts
 */
export type {
  ActivityToolKind,
  ProcessActivityItem,
  ProcessActivityNode,
} from "./types";
export { BRIEF_THINKING_MS } from "./types";

export {
  classifyToolName,
  isBrowserMcpCall,
  isEditToolName,
  isSkippedProcessTool,
} from "./classify";

export { summarizeActivity } from "./summarize";

export {
  editActivityLine,
  editDiffPreviewLines,
  editDiffStatsFromTool,
  editFileIcon,
  lineDiffStats,
} from "./edit-diff";

export {
  activityItemLine,
  applyTodoWriteAndLabel,
  mcpActivityLine,
  toolActivityLine,
} from "./tool-lines";

export {
  estimateWorkedMs,
  formatDurationShort,
  thoughtFoldLabel,
  workedFoldSummary,
} from "./labels";

export { buildProcessActivityTree } from "./tree";
