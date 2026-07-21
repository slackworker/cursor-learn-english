import {
  defaultPromptCorpusPath,
  defaultThinkingCorpusPath,
} from "./default-paths";

export function getCorpusPath(): string {
  return (
    process.env.CORPUS_JSONL_PATH ||
    process.env.THINKING_CORPUS_PATH ||
    defaultThinkingCorpusPath()
  );
}

export function getPromptCorpusPath(): string {
  return process.env.PROMPT_CORPUS_PATH || defaultPromptCorpusPath();
}

export type ThinkingRecord = {
  text: string;
  timestamp: string;
  model: string;
  conversation_id: string;
  generation_id: string;
  duration_ms: number;
};
