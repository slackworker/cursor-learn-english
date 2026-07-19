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
/** First user message is near the top; avoid reading multi‑MB transcripts. */
const TITLE_READ_BYTES = 64 * 1024;

export type ParsedSessionTitle = {
  /** Plain text for search, filters, and legacy clients. */
  plain: string;
  segments: PromptSegment[];
  domContexts: DomContextBlock[];
  body: string;
};

type TitleCacheEntry = {
  mtimeMs: number;
  size: number;
  value: ParsedSessionTitle | null;
};

const titleCache = new Map<string, TitleCacheEntry>();

function safeTrim(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function clipTitle(value: string, maxLen = DEFAULT_MAX_TITLE_LENGTH): string {
  if (value.length <= maxLen) return value;
  return `${value.slice(0, maxLen)}…`;
}

/** Clip rich segments so display matches `plain` (avoids full-prompt headings). */
export function clipParsedSessionTitle(
  parsed: ParsedSessionTitle,
  maxLen = DEFAULT_MAX_TITLE_LENGTH
): ParsedSessionTitle {
  let remaining = maxLen;
  const segments: PromptSegment[] = [];
  for (const seg of parsed.segments) {
    if (remaining <= 0) break;
    if (seg.type === "dom") {
      segments.push(seg);
      continue;
    }
    const text = seg.text;
    if (!text) continue;
    if (text.length <= remaining) {
      segments.push(seg);
      remaining -= text.length;
    } else {
      segments.push({ type: "text", text: `${text.slice(0, remaining)}…` });
      remaining = 0;
    }
  }
  const body =
    parsed.body.length <= maxLen
      ? parsed.body
      : `${parsed.body.slice(0, maxLen)}…`;
  return {
    plain: clipTitle(parsed.plain || body, maxLen),
    segments,
    domContexts: parsed.domContexts,
    body,
  };
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

function parseTitleFromPrefix(content: string): ParsedSessionTitle | null {
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

function readTranscriptTitleParts(sessionId: string): ParsedSessionTitle | null {
  const transcriptPath = resolveTranscriptPath(sessionId);
  if (!transcriptPath) return null;

  let st: fs.Stats;
  try {
    st = fs.statSync(transcriptPath);
  } catch {
    return null;
  }
  if (st.size <= 0) return null;

  const cached = titleCache.get(transcriptPath);
  if (cached && cached.mtimeMs === st.mtimeMs && cached.size === st.size) {
    return cached.value;
  }

  const readLen = Math.min(st.size, TITLE_READ_BYTES);
  const fd = fs.openSync(transcriptPath, "r");
  let content: string;
  try {
    const buf = Buffer.alloc(readLen);
    fs.readSync(fd, buf, 0, readLen, 0);
    content = buf.toString("utf8");
  } finally {
    fs.closeSync(fd);
  }

  // Drop a possibly truncated final line when reading a prefix.
  if (st.size > TITLE_READ_BYTES) {
    const lastNl = content.lastIndexOf("\n");
    if (lastNl >= 0) content = content.slice(0, lastNl);
  }

  const parsed = parseTitleFromPrefix(content);
  titleCache.set(transcriptPath, {
    mtimeMs: st.mtimeMs,
    size: st.size,
    value: parsed,
  });
  return parsed;
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

/** Test-only. */
export function clearSessionTitleCache(): void {
  titleCache.clear();
}
