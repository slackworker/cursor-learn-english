import fs from "fs";
import os from "os";
import path from "path";
import {
  domContextChipLabel,
  parseUserPromptWithDomContext,
  type DomContextBlock,
} from "./parse-dom-context";

const DEFAULT_MAX_TITLE_LENGTH = 60;

export type ParsedSessionTitle = {
  /** Plain text for search, filters, and legacy clients. */
  plain: string;
  domContexts: DomContextBlock[];
  body: string;
};

function getDefaultTranscriptRoot(): string {
  const homeDir = os.platform() === "win32" ? process.env.USERPROFILE || os.homedir() : process.env.HOME || os.homedir();
  return path.join(homeDir, ".cursor", "projects", "home-slackworker-projects-cursor-dashboard", "agent-transcripts");
}

function getTranscriptRoot(): string {
  return process.env.AGENT_TRANSCRIPTS_PATH || process.env.CURSOR_AGENT_TRANSCRIPTS_PATH || getDefaultTranscriptRoot();
}

function safeTrim(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function clipTitle(value: string, maxLen = DEFAULT_MAX_TITLE_LENGTH): string {
  if (value.length <= maxLen) return value;
  return `${value.slice(0, maxLen)}…`;
}

export function parseSessionTitleFromText(rawText: string): ParsedSessionTitle {
  const userQueryMatch = rawText.match(/<user_query>\s*([\s\S]*?)\s*<\/user_query>/i);
  const base = userQueryMatch?.[1] ?? rawText;
  const { domContexts, body } = parseUserPromptWithDomContext(base);
  const displayBody = body.trim();
  const chipFallback = domContexts
    .map((block) => domContextChipLabel(block.htmlElement))
    .join(" ");
  const plainSource =
    displayBody ||
    chipFallback ||
    safeTrim(base.replace(/<[^>]+>/g, " "));
  return {
    plain: clipTitle(plainSource),
    domContexts,
    body: displayBody,
  };
}

function readTranscriptTitleParts(sessionId: string): ParsedSessionTitle | null {
  const root = getTranscriptRoot();
  const transcriptPath = path.join(root, sessionId, `${sessionId}.jsonl`);
  if (!fs.existsSync(transcriptPath)) return null;
  const content = fs.readFileSync(transcriptPath, "utf8");
  if (!content.trim()) return null;
  const lines = content.split("\n");
  for (const line of lines) {
    if (!line.trim()) continue;
    try {
      const record = JSON.parse(line) as {
        role?: string;
        message?: {
          content?: Array<{ type?: string; text?: string }>;
        };
      };
      if (record.role !== "user") continue;
      const blocks = record.message?.content ?? [];
      for (const block of blocks) {
        if (block?.type === "text" && typeof block.text === "string" && block.text.trim()) {
          return parseSessionTitleFromText(block.text);
        }
      }
    } catch {
      continue;
    }
  }
  return null;
}

export function hasSessionTranscript(sessionId: string): boolean {
  if (!sessionId) return false;
  const root = getTranscriptRoot();
  const transcriptPath = path.join(root, sessionId, `${sessionId}.jsonl`);
  if (!fs.existsSync(transcriptPath)) return false;
  try {
    return fs.statSync(transcriptPath).size > 0;
  } catch {
    return false;
  }
}

export function getSessionTitles(sessionIds: string[]): Map<string, ParsedSessionTitle> {
  const result = new Map<string, ParsedSessionTitle>();
  for (const sessionId of sessionIds) {
    if (!sessionId) continue;
    const parsed = readTranscriptTitleParts(sessionId);
    if (parsed) result.set(sessionId, parsed);
  }
  return result;
}
