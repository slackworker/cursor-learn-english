#!/usr/bin/env node
/**
 * Remove historical "orphan" conversation_id rows from data/ JSONL corpora.
 *
 * Orphan = appears in thinking / events / prompt corpora, but has no
 * sessionStart/sessionEnd or subagentStart/subagentStop lifecycle event.
 * (Historical Task subagents often had content rows without any lifecycle.)
 *
 * Usage:
 *   node scripts/cleanup-orphan-corpus.mjs           # backup + clean
 *   node scripts/cleanup-orphan-corpus.mjs --dry-run  # stats only
 */
import fs from 'fs';
import path from 'path';
import { getDataDir } from './default-paths.mjs';

const DRY_RUN = process.argv.includes('--dry-run');
const dataDir = process.env.CURSOR_DASHBOARD_DATA_DIR
  ? path.resolve(process.env.CURSOR_DASHBOARD_DATA_DIR)
  : getDataDir();

const STEMS = ['thinking-corpus', 'cursor-events', 'prompt-corpus'];

function listCorpusFiles(stem) {
  let entries;
  try {
    entries = fs.readdirSync(dataDir);
  } catch (err) {
    throw new Error(`Cannot read data dir ${dataDir}: ${err.message}`);
  }
  return entries
    .filter((name) => name === `${stem}.jsonl` || (name.startsWith(`${stem}-`) && name.endsWith('.jsonl')))
    .sort()
    .map((name) => path.join(dataDir, name));
}

function readJsonlLines(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8');
  if (!raw) return [];
  const lines = raw.split('\n');
  // Drop trailing empty line from final newline; keep mid-file blanks out of rewrite.
  if (lines.length && lines[lines.length - 1] === '') lines.pop();
  return lines;
}

function parseLine(line) {
  if (!line.trim()) return null;
  try {
    return JSON.parse(line);
  } catch {
    return null;
  }
}

/** Keep rows for main sessions and Task subagents (Start/Stop). */
const LIFECYCLE_EVENT_TYPES = new Set([
  'sessionStart',
  'sessionEnd',
  'subagentStart',
  'subagentStop',
]);

function buildLifecycleIds(eventFiles) {
  const lifecycle = new Set();
  let lifecycleRows = 0;
  for (const file of eventFiles) {
    for (const line of readJsonlLines(file)) {
      const o = parseLine(line);
      if (!o) continue;
      if (!LIFECYCLE_EVENT_TYPES.has(o.event_type)) continue;
      lifecycleRows += 1;
      if (o.conversation_id) lifecycle.add(String(o.conversation_id));
      if (o.session_id) lifecycle.add(String(o.session_id));
      if (o.subagent_id) lifecycle.add(String(o.subagent_id));
    }
  }
  return { lifecycle, lifecycleRows };
}

function collectCorpusIds(files) {
  const ids = new Set();
  let rows = 0;
  let bad = 0;
  for (const file of files) {
    for (const line of readJsonlLines(file)) {
      if (!line.trim()) continue;
      rows += 1;
      const o = parseLine(line);
      if (!o) {
        bad += 1;
        continue;
      }
      if (o.conversation_id) ids.add(String(o.conversation_id));
    }
  }
  return { ids, rows, bad };
}

function countOrphanRows(files, orphanIds) {
  let rows = 0;
  const byFile = new Map();
  for (const file of files) {
    let n = 0;
    for (const line of readJsonlLines(file)) {
      const o = parseLine(line);
      if (!o?.conversation_id) continue;
      if (orphanIds.has(String(o.conversation_id))) n += 1;
    }
    if (n > 0) byFile.set(file, n);
    rows += n;
  }
  return { rows, byFile };
}

function stamp() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return (
    `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}` +
    `-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`
  );
}

function backupFile(src, backupRoot) {
  const rel = path.basename(src);
  const dest = path.join(backupRoot, rel);
  fs.copyFileSync(src, dest);
  return dest;
}

function rewriteFile(file, orphanIds) {
  const lines = readJsonlLines(file);
  const kept = [];
  let removed = 0;
  let keptBlank = 0;
  for (const line of lines) {
    if (!line.trim()) {
      // Drop blank lines on rewrite (corpus should be one JSON per line).
      keptBlank += 1;
      continue;
    }
    const o = parseLine(line);
    if (o?.conversation_id && orphanIds.has(String(o.conversation_id))) {
      removed += 1;
      continue;
    }
    kept.push(line);
  }
  if (removed === 0 && keptBlank === 0) {
    return { removed: 0, kept: kept.length, emptied: false, deleted: false, unchanged: true };
  }
  if (kept.length === 0) {
    // Match prune habit: remove unused shards instead of leaving empty files.
    fs.unlinkSync(file);
    return { removed, kept: 0, emptied: true, deleted: true, unchanged: false };
  }
  fs.writeFileSync(file, kept.join('\n') + '\n');
  return { removed, kept: kept.length, emptied: false, deleted: false, unchanged: false };
}

function main() {
  console.log(`[orphan-cleanup] dataDir=${dataDir}`);
  console.log(`[orphan-cleanup] mode=${DRY_RUN ? 'dry-run' : 'apply'}`);

  const filesByStem = Object.fromEntries(STEMS.map((s) => [s, listCorpusFiles(s)]));
  for (const stem of STEMS) {
    console.log(`[orphan-cleanup] ${stem}: ${filesByStem[stem].length} file(s)`);
  }

  const { lifecycle, lifecycleRows } = buildLifecycleIds(filesByStem['cursor-events']);
  console.log(`[orphan-cleanup] lifecycle ids=${lifecycle.size} rows=${lifecycleRows}`);

  const stats = {};
  const orphanUnion = new Set();
  for (const stem of STEMS) {
    const collected = collectCorpusIds(filesByStem[stem]);
    const orphanIds = new Set([...collected.ids].filter((id) => !lifecycle.has(id)));
    for (const id of orphanIds) orphanUnion.add(id);
    const orphanRows = countOrphanRows(filesByStem[stem], orphanIds);
    stats[stem] = {
      rows: collected.rows,
      ids: collected.ids.size,
      orphanIds: orphanIds.size,
      orphanRows: orphanRows.rows,
      filesTouched: orphanRows.byFile.size,
      byFile: orphanRows.byFile,
    };
    console.log(
      `[orphan-cleanup] ${stem}: rows=${collected.rows} ids=${collected.ids.size}` +
        ` orphanIds=${orphanIds.size} orphanRows=${orphanRows.rows}` +
        ` filesTouched=${orphanRows.byFile.size}`,
    );
  }

  console.log(`[orphan-cleanup] union orphan conversation_ids=${orphanUnion.size}`);

  if (DRY_RUN) {
    console.log('[orphan-cleanup] dry-run complete; no files modified.');
    return;
  }

  if (orphanUnion.size === 0) {
    console.log('[orphan-cleanup] nothing to clean.');
    return;
  }

  const backupRoot = path.join(dataDir, `.orphan-cleanup-backup-${stamp()}`);
  fs.mkdirSync(backupRoot, { recursive: true });
  console.log(`[orphan-cleanup] backup=${backupRoot}`);

  const applyStats = {};
  for (const stem of STEMS) {
    applyStats[stem] = { removed: 0, rewritten: [], deletedEmpty: [], unchangedFiles: 0 };
    for (const file of filesByStem[stem]) {
      const wouldTouch = stats[stem].byFile.has(file);
      if (!wouldTouch) {
        applyStats[stem].unchangedFiles += 1;
        continue;
      }
      backupFile(file, backupRoot);
      const result = rewriteFile(file, orphanUnion);
      applyStats[stem].removed += result.removed;
      applyStats[stem].rewritten.push(path.basename(file));
      if (result.deleted) applyStats[stem].deletedEmpty.push(path.basename(file));
      console.log(
        `[orphan-cleanup] ${path.basename(file)}: removed=${result.removed}` +
          ` kept=${result.kept}` +
          (result.deleted ? ' (deleted empty)' : ''),
      );
    }
  }

  // Re-verify
  const filesAfter = Object.fromEntries(STEMS.map((s) => [s, listCorpusFiles(s)]));
  const { lifecycle: lifecycleAfter, lifecycleRows: lifecycleRowsAfter } = buildLifecycleIds(
    filesAfter['cursor-events'],
  );
  console.log(
    `[orphan-cleanup] recheck lifecycle ids=${lifecycleAfter.size} rows=${lifecycleRowsAfter}` +
      ` (before ids=${lifecycle.size} rows=${lifecycleRows})`,
  );

  for (const stem of STEMS) {
    const collected = collectCorpusIds(filesAfter[stem]);
    const orphanIds = [...collected.ids].filter((id) => !lifecycleAfter.has(id));
    console.log(
      `[orphan-cleanup] recheck ${stem}: rows=${collected.rows} ids=${collected.ids.size}` +
        ` orphanIds=${orphanIds.length}`,
    );
  }

  const summary = {
    backup: backupRoot,
    orphanIdsRemoved: orphanUnion.size,
    before: {
      lifecycleIds: lifecycle.size,
      thinkingOrphanIds: stats['thinking-corpus'].orphanIds,
      thinkingOrphanRows: stats['thinking-corpus'].orphanRows,
      eventsOrphanIds: stats['cursor-events'].orphanIds,
      eventsOrphanRows: stats['cursor-events'].orphanRows,
      promptOrphanIds: stats['prompt-corpus'].orphanIds,
      promptOrphanRows: stats['prompt-corpus'].orphanRows,
    },
    removedRows: {
      thinking: applyStats['thinking-corpus'].removed,
      events: applyStats['cursor-events'].removed,
      prompt: applyStats['prompt-corpus'].removed,
      total:
        applyStats['thinking-corpus'].removed +
        applyStats['cursor-events'].removed +
        applyStats['prompt-corpus'].removed,
    },
    deletedEmptyFiles: [
      ...applyStats['thinking-corpus'].deletedEmpty,
      ...applyStats['cursor-events'].deletedEmpty,
      ...applyStats['prompt-corpus'].deletedEmpty,
    ],
    after: {
      lifecycleIds: lifecycleAfter.size,
    },
  };
  const summaryPath = path.join(backupRoot, 'cleanup-summary.json');
  fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2) + '\n');
  console.log(`[orphan-cleanup] summary written: ${summaryPath}`);
  console.log('[orphan-cleanup] done.');
  console.log(JSON.stringify(summary, null, 2));
}

main();
