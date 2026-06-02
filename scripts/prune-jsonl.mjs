#!/usr/bin/env node
/**
 * Manually prune expired daily JSONL shards (same rules as capture hooks).
 * Usage: node scripts/prune-jsonl.mjs [corpus-base-path ...]
 * With no args, prunes default ~/thinking-corpus.jsonl, ~/prompt-corpus.jsonl, ~/cursor-events.jsonl
 */
import os from 'os';
import path from 'path';
import { pruneExpiredDailyFiles } from './jsonl-daily.mjs';

function homeJsonl(name) {
  const home = os.homedir();
  return path.join(home, name);
}

const defaults = [
  homeJsonl('thinking-corpus.jsonl'),
  homeJsonl('prompt-corpus.jsonl'),
  homeJsonl('cursor-events.jsonl'),
];

const targets = process.argv.length > 2 ? process.argv.slice(2) : defaults;

let total = 0;
for (const base of targets) {
  const n = pruneExpiredDailyFiles(base);
  if (n > 0) {
    console.log(`${base}: removed ${n} daily shard(s)`);
  }
  total += n;
}
if (total === 0) {
  console.log('No expired daily shards removed (or retention disabled).');
}
