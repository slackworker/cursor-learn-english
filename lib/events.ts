import path from "path";
import os from "os";
import { readMergedJsonlLinesCached } from "./jsonl-daily";

const defaultEventsPath = path.join(
  os.platform() === "win32" ? process.env.USERPROFILE || os.homedir() : process.env.HOME || os.homedir(),
  "cursor-events.jsonl"
);

export function getEventsPath(): string {
  return (
    process.env.EVENTS_JSONL_PATH ||
    process.env.CURSOR_EVENTS_PATH ||
    defaultEventsPath
  );
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

function readEventsLines(
  basePath: string,
  opts?: { from?: string; to?: string }
) {
  return readMergedJsonlLinesCached(basePath, parseEventLine, opts);
}

function toDateKey(iso: string): string {
  return iso.slice(0, 10);
}

export function getEvents(
  from?: string,
  to?: string,
  eventType?: string
): { events: CursorEvent[]; truncated: boolean } {
  const filePath = getEventsPath();
  const { items, truncated } = readEventsLines(filePath, { from, to });
  let events = items;
  if (from) events = events.filter((e) => toDateKey(e.timestamp) >= from);
  if (to) events = events.filter((e) => toDateKey(e.timestamp) <= to);
  if (eventType) events = events.filter((e) => e.event_type === eventType);
  return { events, truncated };
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
  const { items: events, truncated } = readEventsLines(filePath, { from, to });
  let prompts = 0;
  let toolCalls = 0;
  let toolFailures = 0;
  let sessions = 0;
  let thoughts = 0;
  let fileEdits = 0;
  let contextTokens = 0;
  const filtered: CursorEvent[] = [];

  for (const event of events) {
    const d = toDateKey(event.timestamp);
    if (d < from || d > to) continue;
    filtered.push(event);

    switch (event.event_type) {
      case "beforeSubmitPrompt":
        prompts += 1;
        break;
      case "postToolUse":
        toolCalls += 1;
        break;
      case "postToolUseFailure":
        toolFailures += 1;
        break;
      case "sessionStart":
        sessions += 1;
        break;
      case "afterAgentThought":
        thoughts += 1;
        break;
      case "afterFileEdit":
        fileEdits += 1;
        break;
      case "preCompact":
        contextTokens += Number((event as { context_tokens?: number }).context_tokens) || 0;
        break;
      default:
        break;
    }
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
    truncated,
  };
}
