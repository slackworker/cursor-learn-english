import fs from 'fs';
import path from 'path';

const DAILY_SUFFIX_RE = /^(.+)-(\d{4}-\d{2}-\d{2})\.jsonl$/;

export function isDailySplitEnabled() {
  const v = process.env.JSONL_DAILY_SPLIT;
  if (v === '0' || v === 'false') return false;
  return true;
}

export function getRetentionDays() {
  const n = Number(process.env.JSONL_RETENTION_DAYS);
  if (Number.isFinite(n) && n >= 0) return n;
  return 90;
}

function stemFromBasePath(basePath) {
  const dir = path.dirname(basePath);
  const base = path.basename(basePath);
  const stem = base.endsWith('.jsonl') ? base.slice(0, -6) : base;
  return { dir, stem };
}

export function dailyPathFor(basePath, dateKey) {
  const { dir, stem } = stemFromBasePath(basePath);
  return path.join(dir, `${stem}-${dateKey}.jsonl`);
}

function parseDailyFileDate(filePath, expectedStem) {
  const base = path.basename(filePath);
  const m = base.match(DAILY_SUFFIX_RE);
  if (!m || m[1] !== expectedStem) return null;
  return m[2];
}

function pruneMarkerPath(basePath) {
  const { dir, stem } = stemFromBasePath(basePath);
  return path.join(dir, `.${stem}-jsonl-prune`);
}

export function pruneExpiredDailyFiles(basePath) {
  const retention = getRetentionDays();
  if (retention <= 0) return 0;

  const marker = pruneMarkerPath(basePath);
  const now = Date.now();
  try {
    const last = Number(fs.readFileSync(marker, 'utf8'));
    if (Number.isFinite(last) && now - last < 24 * 60 * 60 * 1000) {
      return 0;
    }
  } catch {
    // no marker
  }

  const cutoff = new Date();
  cutoff.setUTCDate(cutoff.getUTCDate() - retention);
  const cutoffKey = cutoff.toISOString().slice(0, 10);
  const { dir, stem } = stemFromBasePath(basePath);
  let removed = 0;
  let entries;
  try {
    entries = fs.readdirSync(dir);
  } catch {
    return 0;
  }

  for (const name of entries) {
    const full = path.join(dir, name);
    const date = parseDailyFileDate(full, stem);
    if (!date || date >= cutoffKey) continue;
    try {
      fs.unlinkSync(full);
      removed += 1;
    } catch {
      // ignore
    }
  }

  try {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(marker, String(now));
  } catch {
    // ignore
  }
  return removed;
}

export function resolveAppendPath(basePath, dateKey) {
  if (!isDailySplitEnabled()) return basePath;
  const key = dateKey ?? new Date().toISOString().slice(0, 10);
  return dailyPathFor(basePath, key);
}

/**
 * Append one JSONL line; uses daily shard when JSONL_DAILY_SPLIT is enabled (default).
 * Runs TTL prune at most once per 24h per corpus stem.
 */
export function appendJsonlLine(basePath, line) {
  const target = resolveAppendPath(basePath);
  const dir = path.dirname(target);
  fs.mkdirSync(dir, { recursive: true });
  fs.appendFileSync(target, line);
  pruneExpiredDailyFiles(basePath);
}
