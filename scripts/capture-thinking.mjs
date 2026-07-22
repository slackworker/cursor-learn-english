import fs from 'fs';
import path from 'path';
import { pruneExpiredDailyFiles, resolveAppendPath } from './jsonl-daily.mjs';
import { defaultThinkingCorpusPath } from './default-paths.mjs';
import { appendThinkingUnlessDuplicate } from './thinking-dedupe.mjs';
import { logHookError, readHookStdinJson } from './hook-log.mjs';

function getCorpusPath() {
  if (process.env.CORPUS_JSONL_PATH) return process.env.CORPUS_JSONL_PATH;
  if (process.env.THINKING_CORPUS_PATH) return process.env.THINKING_CORPUS_PATH;
  return defaultThinkingCorpusPath();
}

try {
  const input = readHookStdinJson();

  const text = input.text ?? '';
  // Keep short thoughts (e.g. Cursor "Thought briefly") for 1:1 session display.
  // Revisit a min-length threshold only if noise becomes a problem.
  if (typeof text !== 'string' || text.trim().length === 0) {
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

  const basePath = getCorpusPath();
  const target = resolveAppendPath(basePath);
  const result = appendThinkingUnlessDuplicate(target, record, () => {
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.appendFileSync(target, JSON.stringify(record) + '\n');
  });
  if (result === 'written') {
    pruneExpiredDailyFiles(basePath);
  }
} catch (err) {
  logHookError('capture-thinking', err);
  process.exit(0);
}
