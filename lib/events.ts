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

/** Hour-of-day (0–23) prompt counts; tzOffsetMinutes matches `Date.getTimezoneOffset()`. */
export function aggregatePromptsByHourOfDay(
  events: CursorEvent[],
  tzOffsetMinutes = 0
): number[] {
  const hours = Array.from({ length: 24 }, () => 0);
  for (const e of events) {
    if (e.event_type !== "beforeSubmitPrompt") continue;
    const d = new Date(e.timestamp);
    if (Number.isNaN(d.getTime())) continue;
    const localMs = d.getTime() - tzOffsetMinutes * 60_000;
    hours[new Date(localMs).getUTCHours()] += 1;
  }
  return hours;
}
