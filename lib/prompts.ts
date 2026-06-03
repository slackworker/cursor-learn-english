import { readMergedJsonlLinesCached } from "./jsonl-daily";
import { getPromptCorpusPath } from "./thinking";

type PromptRecord = {
  conversation_id: string;
  prompt: string;
  timestamp: string;
};

function parseJsonlLine<T>(line: string): T | null {
  try {
    return JSON.parse(line) as T;
  } catch {
    return null;
  }
}

function toDateKey(iso: string): string {
  return iso.slice(0, 10);
}

export function aggregatePromptsByDay(
  from?: string,
  to?: string
): { byDay: Record<string, number>; total: number; truncated: boolean } {
  const { items, truncated } = readMergedJsonlLinesCached(
    getPromptCorpusPath(),
    parseJsonlLine<PromptRecord>,
    { from, to }
  );

  const byDay: Record<string, number> = {};
  let total = 0;

  for (const p of items) {
    const day = toDateKey(p.timestamp);
    if (from && day < from) continue;
    if (to && day > to) continue;
    byDay[day] = (byDay[day] ?? 0) + 1;
    total += 1;
  }

  return { byDay, total, truncated };
}
