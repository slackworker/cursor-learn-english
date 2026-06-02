import os from 'os';
import { appendJsonlLine } from './jsonl-daily.mjs';

function pathSep() {
  return os.platform() === 'win32' ? '\\' : '/';
}

function getCorpusPath() {
  if (process.env.CORPUS_JSONL_PATH) return process.env.CORPUS_JSONL_PATH;
  if (process.env.THINKING_CORPUS_PATH) return process.env.THINKING_CORPUS_PATH;
  const home = os.platform() === 'win32' ? process.env.USERPROFILE : process.env.HOME;
  return `${home || os.homedir()}${pathSep()}thinking-corpus.jsonl`;
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
