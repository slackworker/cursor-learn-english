#!/usr/bin/env node
/**
 * Manually prune expired daily JSONL shards (same rules as capture hooks).
 * Usage: node scripts/prune-jsonl.mjs [corpus-base-path ...]
 * With no args, prunes defaults under ~/projects/cursor-learn-english/data/
 */
import { pruneExpiredDailyFiles } from './jsonl-daily.mjs';
import {
  defaultEventsPath,
  defaultPromptCorpusPath,
  defaultThinkingCorpusPath,
} from './default-paths.mjs';

const defaults = [
  defaultThinkingCorpusPath(),
  defaultPromptCorpusPath(),
  defaultEventsPath(),
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
