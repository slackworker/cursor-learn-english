import type { TimelineThinking } from "../dialogue-timeline";
import type { TranscriptToolUseItem } from "../transcript-content";

/** Thoughts shorter than this show as "Thought briefly". */
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
