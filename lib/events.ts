import path from "path";
import os from "os";
import { readJsonlLinesCached } from "./jsonl-cache";

const defaultEventsPath = path.join(
  os.platform() === "win32" ? process.env.USERPROFILE || os.homedir() : process.env.HOME || os.homedir(),
  "cursor-events.jsonl"
);
const defaultCorpusPath = path.join(
  os.platform() === "win32" ? process.env.USERPROFILE || os.homedir() : process.env.HOME || os.homedir(),
  "thinking-corpus.jsonl"
);

export function getEventsPath(): string {
  return process.env.EVENTS_JSONL_PATH || defaultEventsPath;
}

export function getCorpusPath(): string {
  return process.env.CORPUS_JSONL_PATH || defaultCorpusPath;
}

export type CursorEvent = {
  event_type: string;
  timestamp: string;
  conversation_id: string | null;
  model?: string | null;
  [key: string]: unknown;
};

function parseEventLine(line: string): CursorEvent | null {
  try {
    return JSON.parse(line) as CursorEvent;
  } catch {
    return null;
  }
}

function readEventsLines(filePath: string): CursorEvent[] {
  return readJsonlLinesCached(filePath, parseEventLine).items;
}

function toDateKey(iso: string): string {
  return iso.slice(0, 10);
}

export function getEvents(from?: string, to?: string, eventType?: string): CursorEvent[] {
  const filePath = getEventsPath();
  let events = readEventsLines(filePath);
  if (from) events = events.filter((e) => toDateKey(e.timestamp) >= from);
  if (to) events = events.filter((e) => toDateKey(e.timestamp) <= to);
  if (eventType) events = events.filter((e) => e.event_type === eventType);
  return events;
}

export function aggregateByDay(events: CursorEvent[]): Record<string, Record<string, number>> {
  const byDay: Record<string, Record<string, number>> = {};
  for (const e of events) {
    const day = toDateKey(e.timestamp);
    if (!byDay[day]) byDay[day] = {};
    const type = e.event_type;
    byDay[day][type] = (byDay[day][type] || 0) + 1;
  }
  return byDay;
}

export function getStats(period: "day" | "week" | "month") {
  const filePath = getEventsPath();
  const events = readEventsLines(filePath);
  const now = new Date();
  let from: string;
  if (period === "day") {
    from = now.toISOString().slice(0, 10);
  } else if (period === "week") {
    const d = new Date(now);
    d.setDate(d.getDate() - 7);
    from = d.toISOString().slice(0, 10);
  } else {
    const d = new Date(now);
    d.setMonth(d.getMonth() - 1);
    from = d.toISOString().slice(0, 10);
  }
  const to = now.toISOString().slice(0, 10);
  const filtered = events.filter((e) => {
    const d = toDateKey(e.timestamp);
    return d >= from && d <= to;
  });

  const prompts = filtered.filter((e) => e.event_type === "beforeSubmitPrompt").length;
  const toolCalls = filtered.filter((e) => e.event_type === "postToolUse").length;
  const toolFailures = filtered.filter((e) => e.event_type === "postToolUseFailure").length;
  const sessions = filtered.filter((e) => e.event_type === "sessionStart").length;
  const thoughts = filtered.filter((e) => e.event_type === "afterAgentThought").length;
  const fileEdits = filtered.filter((e) => e.event_type === "afterFileEdit").length;

  let contextTokens = 0;
  const preCompacts = filtered.filter((e) => e.event_type === "preCompact");
  for (const p of preCompacts) {
    contextTokens += Number((p as { context_tokens?: number }).context_tokens) || 0;
  }

  return {
    prompts,
    toolCalls,
    toolFailures,
    sessions,
    thoughts,
    fileEdits,
    contextTokens,
    byDay: aggregateByDay(filtered),
  };
}
