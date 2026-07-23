import type { DomContextBlock, PromptSegment } from "../parse-dom-context";
import type { DialogueRound } from "../dialogue";
import type { TranscriptTurn } from "../session-transcript";

export type SessionTitleSource = "cursor" | "prompt" | "task";

export type SessionLifecycleSource = "hooks" | "inferred";

export type SessionSummary = {
  session_id: string;
  /** Primary title: Cursor sidebar name, else clipped first prompt / task. */
  title?: string;
  title_source?: SessionTitleSource;
  title_dom_contexts?: DomContextBlock[];
  title_segments?: PromptSegment[];
  title_body?: string;
  /** First user prompt (for dual-line list subtitle). */
  prompt_title?: string;
  prompt_title_dom_contexts?: DomContextBlock[];
  prompt_title_segments?: PromptSegment[];
  prompt_title_body?: string;
  reason?: string;
  duration_ms?: number;
  // sessionEnd / subagentStop timestamp
  timestamp?: string;
  // sessionStart / subagentStart timestamp
  start?: string;
  /** Latest afterAgentResponse in this session (preferred list sort key). */
  last_reply?: string;
  /** last_reply, else latest user prompt, else session end/start — used for sorting & display. */
  last_activity?: string;
  is_open?: boolean;
  /** Task-tool subagent session (from subagentStart/Stop). */
  is_subagent?: boolean;
  parent_session_id?: string;
  /** Short display title for parent_session_id (detail views). */
  parent_session_title?: string;
  parent_session_title_dom_contexts?: DomContextBlock[];
  parent_session_title_segments?: PromptSegment[];
  parent_session_title_body?: string;
  subagent_type?: string;
  /**
   * hooks = saw sessionStart (or subagentStart for subagents);
   * inferred = listed from prompts/content because lifecycle start was missing.
   */
  lifecycle_source?: SessionLifecycleSource;
  /** Debug-facing gaps when lifecycle_source is inferred. */
  lifecycle_gaps?: string[];
};

export type GetSessionSummariesOptions = {
  includeSubagents?: boolean;
};

/** Prompt JSONL row used while building session shells. */
export type PromptRecord = {
  conversation_id: string;
  prompt: string;
  timestamp: string;
};

/** Child Task subagent link shown on a parent session detail page. */
export type SessionSubagentLink = {
  session_id: string;
  title?: string;
  title_dom_contexts?: DomContextBlock[];
  title_segments?: PromptSegment[];
  title_body?: string;
  /** Short Task `description` from hooks (best match key for transcript Task chips). */
  task_description?: string;
  subagent_type?: string;
  start?: string;
  timestamp?: string;
  is_open?: boolean;
};

export type SessionDetail = SessionSummary & {
  event_counts: Record<string, number>;
  prompt_count: number;
  thinking_count: number;
  recent_prompts: Array<{ prompt: string; timestamp: string }>;
  recent_thinking: Array<{ text_preview: string; timestamp: string; model: string }>;
  timeline: Array<{
    event_type: string;
    timestamp: string;
    reason?: string;
    duration_ms?: number;
    tool_name?: string | null;
  }>;
  dialogue_rounds: DialogueRound[];
  transcript_turns: Array<
    TranscriptTurn & {
      round?: DialogueRound;
    }
  >;
  /** Subagent children of this session (parent detail views). */
  subagents?: SessionSubagentLink[];
};
