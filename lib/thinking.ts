import fs from "fs";
import path from "path";
import os from "os";

const homeDir = os.platform() === "win32" ? process.env.USERPROFILE || os.homedir() : process.env.HOME || os.homedir();

const defaultCorpusPath = path.join(homeDir, "thinking-corpus.jsonl");
const defaultPromptCorpusPath = path.join(homeDir, "prompt-corpus.jsonl");

export function getCorpusPath(): string {
  return process.env.CORPUS_JSONL_PATH || defaultCorpusPath;
}

function getPromptCorpusPath(): string {
  return process.env.PROMPT_CORPUS_PATH || defaultPromptCorpusPath;
}

export type ThinkingRecord = {
  text: string;
  timestamp: string;
  model: string;
  conversation_id: string;
  generation_id: string;
  duration_ms: number;
  user_prompt?: string;
};

type PromptRecord = {
  conversation_id: string;
  prompt: string;
  timestamp: string;
};

function readJsonlLines<T>(filePath: string): T[] {
  if (!fs.existsSync(filePath)) return [];
  const content = fs.readFileSync(filePath, "utf-8");
  const lines = content.trim().split("\n").filter(Boolean);
  const out: T[] = [];
  for (const line of lines) {
    try {
      out.push(JSON.parse(line) as T);
    } catch {
      // skip
    }
  }
  return out;
}

function attachUserPrompts(thinkingItems: ThinkingRecord[]): void {
  const prompts = readJsonlLines<PromptRecord>(getPromptCorpusPath());
  if (prompts.length === 0) return;

  const byConversation = new Map<string, PromptRecord[]>();
  for (const p of prompts) {
    const cid = p.conversation_id || "";
    let list = byConversation.get(cid);
    if (!list) {
      list = [];
      byConversation.set(cid, list);
    }
    list.push(p);
  }
  for (const list of byConversation.values()) {
    list.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  }

  for (const item of thinkingItems) {
    const cid = item.conversation_id || "";
    const candidates = byConversation.get(cid);
    if (!candidates || candidates.length === 0) continue;

    let matched: PromptRecord | undefined;
    for (const p of candidates) {
      if (p.timestamp <= item.timestamp) {
        matched = p;
      } else {
        break;
      }
    }
    if (matched) {
      item.user_prompt = matched.prompt;
    }
  }
}

export function getThinking(params: {
  page?: number;
  pageSize?: number;
  from?: string;
  to?: string;
  model?: string;
}): { items: ThinkingRecord[]; total: number } {
  const { page = 1, pageSize = 20, from, to, model } = params;
  const filePath = getCorpusPath();
  let items = readJsonlLines<ThinkingRecord>(filePath);
  // newest first
  items = items.reverse();

  if (from) items = items.filter((r) => r.timestamp.slice(0, 10) >= from);
  if (to) items = items.filter((r) => r.timestamp.slice(0, 10) <= to);
  if (model) items = items.filter((r) => r.model === model);

  const total = items.length;
  const start = (page - 1) * pageSize;
  items = items.slice(start, start + pageSize);

  attachUserPrompts(items);

  return { items, total };
}
