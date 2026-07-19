#!/usr/bin/env node
/**
 * Remove twin thinking-corpus duplicates written by double afterAgentThought.
 * Usage:
 *   node scripts/dedupe-thinking-corpus.mjs [file-or-dir ...]
 * With no args, cleans default data dir thinking-corpus*.jsonl
 */
import fs from 'fs';
import path from 'path';
import { getDataDir, defaultThinkingCorpusPath } from './default-paths.mjs';
import { dedupeThinkingRecords } from './thinking-dedupe.mjs';

function listThinkingFiles(arg) {
  const st = fs.statSync(arg);
  if (st.isDirectory()) {
    return fs
      .readdirSync(arg)
      .filter(
        (n) =>
          n === 'thinking-corpus.jsonl' ||
          /^thinking-corpus-\d{4}-\d{2}-\d{2}\.jsonl$/.test(n),
      )
      .map((n) => path.join(arg, n))
      .sort();
  }
  return [arg];
}

function dedupeFile(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8');
  if (!raw.trim()) {
    return { before: 0, after: 0, removed: 0 };
  }

  const records = [];
  const invalidLines = [];
  for (const line of raw.split('\n')) {
    if (!line.trim()) continue;
    try {
      records.push(JSON.parse(line));
    } catch {
      invalidLines.push(line);
    }
  }

  const before = records.length;
  const { kept, removed } = dedupeThinkingRecords(records);
  if (removed === 0) {
    return { before, after: before, removed: 0 };
  }

  const outLines = kept.map((r) => JSON.stringify(r));
  for (const line of invalidLines) outLines.push(line);

  const tmp = `${filePath}.dedupe-tmp`;
  fs.writeFileSync(tmp, outLines.length ? `${outLines.join('\n')}\n` : '');
  fs.renameSync(tmp, filePath);
  return { before, after: kept.length, removed };
}

const args = process.argv.slice(2);
const roots = args.length > 0 ? args : [getDataDir()];
const files = [...new Set(roots.flatMap(listThinkingFiles))];

if (args.length === 0) {
  const base = defaultThinkingCorpusPath();
  if (fs.existsSync(base) && !files.includes(base)) files.push(base);
}

let totalRemoved = 0;
let touched = 0;
for (const file of files) {
  const { before, after, removed } = dedupeFile(file);
  if (removed > 0) {
    console.log(`${file}: ${before} → ${after} (−${removed})`);
    totalRemoved += removed;
    touched += 1;
  }
}

if (totalRemoved === 0) {
  console.log(`No thinking twins found in ${files.length} file(s).`);
} else {
  console.log(`Done: removed ${totalRemoved} duplicate(s) across ${touched} file(s).`);
}
