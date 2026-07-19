import fs from "fs";
import {
  parseUserPromptWithDomContext,
  type DomContextBlock,
} from "./parse-dom-context";
import {
  parseAssistantContent,
  stripCursorRedacted,
  type TranscriptAssistantStep,
} from "./transcript-content";
import { resolveTranscriptPath } from "./agent-transcripts-path";

export type { DomContextBlock } from "./parse-dom-context";

export type { TranscriptAssistantStep, TranscriptContentItem } from "./transcript-content";

export type TranscriptTurn = {
  id: string;
  user_text: string;
  user_prompt: string;
  /** Cursor browser DOM picker blocks stripped from user_prompt. */
  user_dom_contexts?: DomContextBlock[];
  user_timestamp?: string;
  assistant_text?: string;
  assistant_segments?: string[];
  /** Ordered steps from agent-transcripts (text + tool_use per JSONL line). */
  assistant_steps?: TranscriptAssistantStep[];
};

type TranscriptRecord = {
  role?: string;
  message?: {
    content?: Array<{
      type?: string;
      text?: string;
      name?: string;
      input?: Record<string, unknown>;
    }>;
  };
};

/** Join text blocks only (legacy segments); strips Cursor [REDACTED] placeholders. */
function collectText(record: TranscriptRecord): string {
  const parts =
    record.message?.content
      ?.filter((c) => c?.type === "text" && typeof c.text === "string")
      .map((c) => stripCursorRedacted(c.text ?? ""))
      .filter((t) => t.length > 0) ?? [];
  return parts.join("\n\n").trim();
}

const CURSOR_META_BLOCK_TAGS = [
  "attached_files",
  "external_links",
  "code_selection",
  "terminal_selection",
  "timestamp",
  "user_info",
  "rules",
  "agent_skills",
  "mcp_file_system",
] as const;

function stripCursorMetaBlocks(text: string): string {
  let result = text;
  for (const tag of CURSOR_META_BLOCK_TAGS) {
    result = result.replace(
      new RegExp(`<${tag}\\b[^>]*>[\\s\\S]*?</${tag}>`, "gi"),
      ""
    );
    result = result.replace(new RegExp(`<${tag}\\b[^>]*/>`, "gi"), "");
  }
  return result;
}

function normalizePromptBody(text: string): string {
  return text
    .split("\n")
    .map((line) => line.trimEnd())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Extract displayable user prompt from transcript text; preserve Markdown newlines. */
function extractUserPrompt(raw: string): { prompt: string; domContexts: DomContextBlock[] } {
  const userQueryMatch = raw.match(/<user_query>\s*([\s\S]*?)\s*<\/user_query>/i);
  const base = stripCursorMetaBlocks((userQueryMatch?.[1] ?? raw).trim());
  const { domContexts, body } = parseUserPromptWithDomContext(base);
  return {
    prompt: normalizePromptBody(body),
    domContexts,
  };
}

function extractUserTimestamp(raw: string): string | undefined {
  const timestampMatch = raw.match(/<timestamp>\s*([\s\S]*?)\s*<\/timestamp>/i);
  const value = timestampMatch?.[1]?.trim();
  return value || undefined;
}

export function getTranscriptTurns(sessionId: string): TranscriptTurn[] {
  const transcriptPath = resolveTranscriptPath(sessionId);
  if (!transcriptPath) return [];
  const content = fs.readFileSync(transcriptPath, "utf8");
  if (!content.trim()) return [];

  const turns: TranscriptTurn[] = [];
  let pendingUser: {
    id: string;
    user_text: string;
    assistant_parts: string[];
    assistant_steps: TranscriptAssistantStep[];
  } | null = null;

  function flushPendingUser() {
    if (!pendingUser) return;
    const assistantSegments = pendingUser.assistant_parts.filter(Boolean);
    const assistantText = assistantSegments.join("\n\n").trim();
    const { prompt, domContexts } = extractUserPrompt(pendingUser.user_text);
    turns.push({
      id: pendingUser.id,
      user_text: pendingUser.user_text,
      user_prompt: prompt,
      user_dom_contexts: domContexts.length > 0 ? domContexts : undefined,
      user_timestamp: extractUserTimestamp(pendingUser.user_text),
      assistant_text: assistantText || undefined,
      assistant_segments: assistantSegments.length > 0 ? assistantSegments : undefined,
      assistant_steps:
        pendingUser.assistant_steps.length > 0
          ? pendingUser.assistant_steps
          : undefined,
    });
    pendingUser = null;
  }

  for (const line of content.split("\n")) {
    if (!line.trim()) continue;
    let record: TranscriptRecord | null = null;
    try {
      record = JSON.parse(line) as TranscriptRecord;
    } catch {
      record = null;
    }
    if (!record) continue;

    if (record.role === "user") {
      const text = collectText(record);
      if (!text) continue;
      flushPendingUser();
      pendingUser = {
        id: `${sessionId}::${turns.length + 1}`,
        user_text: text,
        assistant_parts: [],
        assistant_steps: [],
      };
      continue;
    }

    if (record.role === "assistant" && pendingUser) {
      const step = parseAssistantContent(record.message?.content);
      if (step) pendingUser.assistant_steps.push(step);

      const text = collectText(record);
      if (text) pendingUser.assistant_parts.push(text);
    }
  }

  flushPendingUser();
  return turns;
}
