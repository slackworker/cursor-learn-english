/**
 * Shared Cursor-style process / final split.
 *
 * Process = everything before the first response that appears after the last tool.
 * That keeps interim narration + thinking + tools collapsed, leaves the formal
 * reply expanded, and lets post-reply thinking (e.g. "Thought briefly") stay
 * after the reply instead of folding the reply away.
 *
 * Returns the exclusive end index of the process slice: process = items[0..end),
 * final = items[end..].
 */
export type ProcessFoldKind = "thinking" | "tool" | "response" | "other";

export function findProcessFinalSplitIndex(
  kinds: ReadonlyArray<ProcessFoldKind>
): number {
  let lastToolIdx = -1;
  for (let i = 0; i < kinds.length; i += 1) {
    if (kinds[i] === "tool") lastToolIdx = i;
  }

  for (let i = lastToolIdx + 1; i < kinds.length; i += 1) {
    if (kinds[i] === "response") return i;
  }

  if (!kinds.some((k) => k === "response")) {
    return kinds.length;
  }

  // Responses exist only at/before the last tool (interim-only) — keep all in process.
  return kinds.length;
}
