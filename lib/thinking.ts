import path from "path";
import os from "os";
import { readMergedJsonlLinesCached } from "./jsonl-daily";

const homeDir = os.platform() === "win32" ? process.env.USERPROFILE || os.homedir() : process.env.HOME || os.homedir();

const defaultCorpusPath = path.join(homeDir, "thinking-corpus.jsonl");
const defaultPromptCorpusPath = path.join(homeDir, "prompt-corpus.jsonl");

export function getCorpusPath(): string {
  return (
    process.env.CORPUS_JSONL_PATH ||
    process.env.THINKING_CORPUS_PATH ||
    defaultCorpusPath
  );
}

export function getPromptCorpusPath(): string {
  return process.env.PROMPT_CORPUS_PATH || defaultPromptCorpusPath;
}

export type ThinkingRecord = {
  text: string;
  timestamp: string;
  model: string;
  conversation_id: string;
  generation_id: string;
  duration_ms: number;
};

export type ThinkingGroup = {
  user_prompt?: string;
  prompt_timestamp?: string;
  conversation_id: string;
  items: ThinkingRecord[];
};

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

function readJsonlFile<T>(
  basePath: string,
  opts?: { from?: string; to?: string }
) {
  return readMergedJsonlLinesCached(basePath, parseJsonlLine<T>, opts);
}

/**
 * Groups thinking records by their matched prompt.
 * One prompt can trigger multiple thinking records (one-to-many).
 */
function groupByPrompt(
  thinkingItems: ThinkingRecord[],
  opts?: { from?: string; to?: string }
): { groups: ThinkingGroup[]; truncated: boolean } {
  const { items: prompts, truncated } = readJsonlFile<PromptRecord>(
    getPromptCorpusPath(),
    opts
  );

  const promptsByConv = new Map<string, PromptRecord[]>();
  for (const p of prompts) {
    const cid = p.conversation_id || "";
    let list = promptsByConv.get(cid);
    if (!list) {
      list = [];
      promptsByConv.set(cid, list);
    }
    list.push(p);
  }
  for (const list of promptsByConv.values()) {
    list.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  }

  // For each thinking item, find which prompt it belongs to
  type MatchKey = string; // "conversationId::promptTimestamp"
  const groupMap = new Map<MatchKey, ThinkingGroup>();
  const groupOrder: MatchKey[] = [];

  for (const item of thinkingItems) {
    const cid = item.conversation_id || "";
    const candidates = promptsByConv.get(cid);

    let matched: PromptRecord | undefined;
    if (candidates && candidates.length > 0) {
      for (const p of candidates) {
        if (p.timestamp <= item.timestamp) {
          matched = p;
        } else {
          break;
        }
      }
    }

    const key = matched
      ? `${cid}::${matched.timestamp}`
      : `${cid}::no-prompt::${item.generation_id}`;

    let group = groupMap.get(key);
    if (!group) {
      group = {
        user_prompt: matched?.prompt,
        prompt_timestamp: matched?.timestamp,
        conversation_id: cid,
        items: [],
      };
      groupMap.set(key, group);
      groupOrder.push(key);
    }
    group.items.push(item);
  }

  // Sort items within each group by timestamp ascending
  for (const group of groupMap.values()) {
    group.items.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  }

  return { groups: groupOrder.map((k) => groupMap.get(k)!), truncated };
}

export function getThinking(params: {
  page?: number;
  pageSize?: number;
  from?: string;
  to?: string;
  model?: string;
}): { groups: ThinkingGroup[]; total: number; truncated: boolean } {
  const { page = 1, pageSize = 20, from, to, model } = params;
  const filePath = getCorpusPath();
  const { items: rawItems, truncated: corpusTruncated } =
    readJsonlFile<ThinkingRecord>(filePath, { from, to });
  let items = rawItems;

  if (from) items = items.filter((r) => r.timestamp.slice(0, 10) >= from);
  if (to) items = items.filter((r) => r.timestamp.slice(0, 10) <= to);
  if (model) items = items.filter((r) => r.model === model);

  // newest first for grouping order
  items.reverse();

  const { groups: allGroups, truncated: promptTruncated } = groupByPrompt(items, {
    from,
    to,
  });
  const truncated = corpusTruncated || promptTruncated;

  const total = allGroups.length;
  const start = (page - 1) * pageSize;
  const groups = allGroups.slice(start, start + pageSize);

  return { groups, total, truncated };
}
