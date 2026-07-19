import fs from 'fs';
import { appendJsonlLine } from './jsonl-daily.mjs';
import { defaultPromptCorpusPath } from './default-paths.mjs';

const MAX_PROMPT_LEN = 6000;

function getPromptCorpusPath() {
  if (process.env.PROMPT_CORPUS_PATH) return process.env.PROMPT_CORPUS_PATH;
  return defaultPromptCorpusPath();
}

try {
  const raw = fs.readFileSync(0, 'utf8');
  const input = JSON.parse(raw || '{}');

  const prompt = (input.prompt ?? '').slice(0, MAX_PROMPT_LEN);
  if (typeof prompt !== 'string' || prompt.length === 0) {
    process.exit(0);
  }

  const record = {
    conversation_id: input.conversation_id ?? '',
    prompt,
    timestamp: new Date().toISOString(),
  };

  appendJsonlLine(getPromptCorpusPath(), JSON.stringify(record) + '\n');
} catch {
  process.exit(0);
}
