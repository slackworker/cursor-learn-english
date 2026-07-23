/**
 * Cursor-like dialogue / process timeline UI.
 *
 * Module map (edit the smallest file that owns the concern):
 * - DialogueTimeline.tsx     entry: transcript path vs events fallback
 * - transcript-path.tsx      interleaved transcript + process fold
 * - process-activity-views.tsx  Shell / Edit / activity tree rendering
 * - transcript-tools.tsx     tool chips, batches, step rows
 * - events-fallback.tsx      events-only timeline (no agent-transcripts)
 * - fold.tsx                 ProcessFold chrome + ThinkingBlock + TTS text
 * - context.tsx              Task subagent link context
 */
export { DialogueTimeline } from "./DialogueTimeline";
