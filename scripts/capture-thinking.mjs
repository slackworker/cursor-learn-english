import fs from 'fs';
import { appendJsonlLine } from './jsonl-daily.mjs';
import { defaultThinkingCorpusPath } from './default-paths.mjs';

function getCorpusPath() {
  if (process.env.CORPUS_JSONL_PATH) return process.env.CORPUS_JSONL_PATH;
  if (process.env.THINKING_CORPUS_PATH) return process.env.THINKING_CORPUS_PATH;
  return defaultThinkingCorpusPath();
}



try {
  const raw = fs.readFileSync(0, 'utf8');
  const input = JSON.parse(raw || '{}');

  const text = input.text ?? '';
  if (typeof text !== 'string' || text.length < 20) {
    process.exit(0);
  }

  const record = {
    text,
    timestamp: new Date().toISOString(),
    model: input.model ?? 'unknown',
    conversation_id: input.conversation_id ?? '',
    generation_id: input.generation_id ?? '',
    duration_ms: Number(input.duration_ms) || 0,
  };

  appendJsonlLine(getCorpusPath(), JSON.stringify(record) + '\n');
} catch {
  process.exit(0);
}
