import fs from "fs";
import {
  domContextChipLabel,
  parseUserPromptWithDomContext,
  type DomContextBlock,
  type PromptSegment,
} from "./parse-dom-context";
import {
  resolveTranscriptPath,
} from "./agent-transcripts-path";

export { hasSessionTranscript } from "./agent-transcripts-path";

const DEFAULT_MAX_TITLE_LENGTH = 60;

export type ParsedSessionTitle = {
  /** Plain text for search, filters, and legacy clients. */
  plain: string;
  segments: PromptSegment[];
  domContexts: DomContextBlock[];
  body: string;
};

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
  const { segments, domContexts, body } = parseUserPromptWithDomContext(base);
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
    segments,
    domContexts,
    body: displayBody,
  };
}

function readTranscriptTitleParts(sessionId: string): ParsedSessionTitle | null {
  const transcriptPath = resolveTranscriptPath(sessionId);
  if (!transcriptPath) return null;
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

export function getSessionTitles(sessionIds: string[]): Map<string, ParsedSessionTitle> {
  const result = new Map<string, ParsedSessionTitle>();
  for (const sessionId of sessionIds) {
    if (!sessionId) continue;
    const parsed = readTranscriptTitleParts(sessionId);
    if (parsed) result.set(sessionId, parsed);
  }
  return result;
}
