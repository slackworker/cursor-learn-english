import fs from 'fs';
import os from 'os';

const MAX_PROMPT_LEN = 6000;

function getPromptCorpusPath() {
  if (process.env.PROMPT_CORPUS_PATH) return process.env.PROMPT_CORPUS_PATH;
  const home = os.platform() === 'win32' ? process.env.USERPROFILE : process.env.HOME;
  return `${home || os.homedir()}${os.platform() === 'win32' ? '\\' : '/'}prompt-corpus.jsonl`;
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

  const corpusPath = getPromptCorpusPath();
  fs.appendFileSync(corpusPath, JSON.stringify(record) + '\n');
} catch {
  process.exit(0);
}
