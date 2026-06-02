import fs from "fs";
import os from "os";
import path from "path";

export type TranscriptTurn = {
  id: string;
  user_text: string;
  user_prompt: string;
  user_timestamp?: string;
  assistant_text?: string;
  assistant_segments?: string[];
};

type TranscriptRecord = {
  role?: string;
  message?: {
    content?: Array<{
      type?: string;
      text?: string;
    }>;
  };
};

function getDefaultTranscriptRoot(): string {
  const homeDir = os.platform() === "win32" ? process.env.USERPROFILE || os.homedir() : process.env.HOME || os.homedir();
  return path.join(homeDir, ".cursor", "projects", "home-slackworker-projects-cursor-dashboard", "agent-transcripts");
}

function getTranscriptRoot(): string {
  return process.env.AGENT_TRANSCRIPTS_PATH || process.env.CURSOR_AGENT_TRANSCRIPTS_PATH || getDefaultTranscriptRoot();
}

function getTranscriptPath(sessionId: string): string {
  return path.join(getTranscriptRoot(), sessionId, `${sessionId}.jsonl`);
}

function collectText(record: TranscriptRecord): string {
  const parts =
    record.message?.content
      ?.filter((c) => c?.type === "text" && typeof c.text === "string")
      .map((c) => c.text?.trim() ?? "")
      .filter(Boolean) ?? [];
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

/** Extract displayable user prompt from transcript text; preserve Markdown newlines. */
function extractUserPrompt(raw: string): string {
  const userQueryMatch = raw.match(/<user_query>\s*([\s\S]*?)\s*<\/user_query>/i);
  const base = stripCursorMetaBlocks((userQueryMatch?.[1] ?? raw).trim());
  return base
    .split("\n")
    .map((line) => line.trimEnd())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function extractUserTimestamp(raw: string): string | undefined {
  const timestampMatch = raw.match(/<timestamp>\s*([\s\S]*?)\s*<\/timestamp>/i);
  const value = timestampMatch?.[1]?.trim();
  return value || undefined;
}

export function getTranscriptTurns(sessionId: string): TranscriptTurn[] {
  const transcriptPath = getTranscriptPath(sessionId);
  if (!fs.existsSync(transcriptPath)) return [];
  const content = fs.readFileSync(transcriptPath, "utf8");
  if (!content.trim()) return [];

  const turns: TranscriptTurn[] = [];
  let pendingUser: { id: string; user_text: string; assistant_parts: string[] } | null = null;

  function flushPendingUser() {
    if (!pendingUser) return;
    const assistantSegments = pendingUser.assistant_parts.filter(Boolean);
    const assistantText = assistantSegments.join("\n\n").trim();
    turns.push({
      id: pendingUser.id,
      user_text: pendingUser.user_text,
      user_prompt: extractUserPrompt(pendingUser.user_text),
      user_timestamp: extractUserTimestamp(pendingUser.user_text),
      assistant_text: assistantText || undefined,
      assistant_segments: assistantSegments.length > 0 ? assistantSegments : undefined,
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
    const text = collectText(record);
    if (!text) continue;

    if (record.role === "user") {
      flushPendingUser();
      pendingUser = {
        id: `${sessionId}::${turns.length + 1}`,
        user_text: text,
        assistant_parts: [],
      };
      continue;
    }

    if (record.role === "assistant" && pendingUser) {
      pendingUser.assistant_parts.push(text);
    }
  }

  flushPendingUser();
  return turns;
}
