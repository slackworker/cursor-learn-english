/**
 * Session domain — list summaries + detail assembly from Hooks JSONL.
 *
 * Module map (edit the smallest file that owns the concern):
 * - types.ts          public types (safe for `import type` from client)
 * - ids.ts            session / subagent id sanitization & event extractors
 * - util.ts           timestamps, title helpers, JSONL parse
 * - lifecycle.ts      global sessionStart/subagentStart caches
 * - titles.ts         Cursor + transcript title enrichment
 * - main-summaries.ts main-session shells from sessionStart/End
 * - subagents.ts      Task subagent merge + call-* → UUID canonicalization
 * - summaries.ts      cached getSessionSummaries / lookup aliases
 * - detail.ts         getSessionDetail + single-session summary
 */
export type {
  GetSessionSummariesOptions,
  SessionDetail,
  SessionLifecycleSource,
  SessionSubagentLink,
  SessionSummary,
  SessionTitleSource,
} from "./types";

export { sanitizeSessionId } from "./ids";
export { enrichSessionPageTitles } from "./titles";
export {
  clearSessionSummariesCache,
  getSessionSummaries,
  resolveSessionLookupId,
} from "./summaries";
export { getSessionDetail } from "./detail";
