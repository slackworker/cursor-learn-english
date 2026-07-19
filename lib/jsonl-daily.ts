import fs from "fs";
import path from "path";
import { type ReadJsonlResult } from "./jsonl";
import { clearJsonlCache, readJsonlLinesCached } from "./jsonl-cache";

const DAILY_SUFFIX_RE = /^(.+)-(\d{4}-\d{2}-\d{2})\.jsonl$/;

/** When false, capture still uses a single file; read side still merges daily shards if present. */
export function isDailySplitEnabled(): boolean {
  const v = process.env.JSONL_DAILY_SPLIT;
  if (v === "0" || v === "false") return false;
  return true;
}

/** 0 disables TTL pruning. Default 90 days. */
export function getRetentionDays(): number {
  const n = Number(process.env.JSONL_RETENTION_DAYS);
  if (Number.isFinite(n) && n >= 0) return n;
  return 90;
}

export function stemFromBasePath(basePath: string): { dir: string; stem: string } {
  const dir = path.dirname(basePath);
  const base = path.basename(basePath);
  const stem = base.endsWith(".jsonl") ? base.slice(0, -6) : base;
  return { dir, stem };
}

export function dailyPathFor(basePath: string, dateKey: string): string {
  const { dir, stem } = stemFromBasePath(basePath);
  return path.join(dir, `${stem}-${dateKey}.jsonl`);
}

export function parseDailyFileDate(
  filePath: string,
  expectedStem: string
): string | null {
  const base = path.basename(filePath);
  const m = base.match(DAILY_SUFFIX_RE);
  if (!m || m[1] !== expectedStem) return null;
  return m[2];
}

export function listDailyPaths(
  basePath: string,
  from?: string,
  to?: string
): string[] {
  const { dir, stem } = stemFromBasePath(basePath);
  let entries: string[];
  try {
    entries = fs.readdirSync(dir);
  } catch {
    return [];
  }
  const paths: { date: string; path: string }[] = [];
  for (const name of entries) {
    const full = path.join(dir, name);
    const date = parseDailyFileDate(full, stem);
    if (!date) continue;
    if (from && date < from) continue;
    if (to && date > to) continue;
    paths.push({ date, path: full });
  }
  paths.sort((a, b) => a.date.localeCompare(b.date));
  return paths.map((p) => p.path);
}

/**
 * Paths to read: daily shards in range, plus legacy only when needed.
 *
 * After a daily split, shards cover recent days; the monolithic file holds
 * pre-shard history. Skip legacy when `from` is on/after the earliest shard
 * so short windows do not re-parse the 10MB+ archive.
 */
export function resolveReadPaths(
  basePath: string,
  from?: string,
  to?: string
): string[] {
  const { dir, stem } = stemFromBasePath(basePath);
  let entries: string[];
  try {
    entries = fs.readdirSync(dir);
  } catch {
    entries = [];
  }

  const dailyAll: { date: string; path: string }[] = [];
  for (const name of entries) {
    const full = path.join(dir, name);
    const date = parseDailyFileDate(full, stem);
    if (!date) continue;
    dailyAll.push({ date, path: full });
  }
  dailyAll.sort((a, b) => a.date.localeCompare(b.date));

  const dailyInRange = dailyAll.filter((d) => {
    if (from && d.date < from) return false;
    if (to && d.date > to) return false;
    return true;
  });
  const earliestDaily = dailyAll[0]?.date ?? null;

  const paths: string[] = [];
  const legacyExists = fs.existsSync(basePath);
  const needLegacy =
    legacyExists &&
    (dailyInRange.length === 0 ||
      !earliestDaily ||
      !from ||
      from < earliestDaily);

  if (needLegacy) paths.push(basePath);
  for (const d of dailyInRange) {
    if (!paths.includes(d.path)) paths.push(d.path);
  }
  return paths;
}

export function resolveAppendPath(basePath: string, dateKey?: string): string {
  if (!isDailySplitEnabled()) return basePath;
  const key = dateKey ?? new Date().toISOString().slice(0, 10);
  return dailyPathFor(basePath, key);
}

function pruneMarkerPath(basePath: string): string {
  const { dir, stem } = stemFromBasePath(basePath);
  return path.join(dir, `.${stem}-jsonl-prune`);
}

/** Delete daily shard files older than retention window. Never deletes the legacy monolithic file. */
export function pruneExpiredDailyFiles(basePath: string): number {
  const retention = getRetentionDays();
  if (retention <= 0) return 0;

  const marker = pruneMarkerPath(basePath);
  const now = Date.now();
  try {
    const last = Number(fs.readFileSync(marker, "utf-8"));
    if (Number.isFinite(last) && now - last < 24 * 60 * 60 * 1000) {
      return 0;
    }
  } catch {
    // no marker yet
  }

  const cutoff = new Date();
  cutoff.setUTCDate(cutoff.getUTCDate() - retention);
  const cutoffKey = cutoff.toISOString().slice(0, 10);

  const { dir, stem } = stemFromBasePath(basePath);
  let removed = 0;
  let entries: string[];
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
      // ignore permission errors
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

export function readMergedJsonlLines<T>(
  basePath: string,
  parse: (line: string) => T | null,
  opts?: { from?: string; to?: string }
): ReadJsonlResult<T> {
  const paths = resolveReadPaths(basePath, opts?.from, opts?.to);
  if (paths.length === 0) {
    return { items: [], truncated: false };
  }

  const allItems: T[] = [];
  let truncated = false;
  for (const filePath of paths) {
    // Per-file cache: when only today's shard grows, older days stay parsed.
    const result = readJsonlLinesCached(filePath, parse);
    if (result.truncated) truncated = true;
    allItems.push(...result.items);
  }
  return { items: allItems, truncated };
}

type MergedCacheEntry<T> = {
  signature: string;
  result: ReadJsonlResult<T>;
};

const mergedCache = new Map<string, MergedCacheEntry<unknown>>();

/** File mtime/size signature for merged JSONL reads (cache invalidation). */
export function getMergedReadSignature(
  basePath: string,
  from?: string,
  to?: string
): string {
  const paths = resolveReadPaths(basePath, from, to);
  const parts: string[] = [];
  for (const p of paths) {
    try {
      const s = fs.statSync(p);
      parts.push(`${p}:${s.mtimeMs}:${s.size}`);
    } catch {
      parts.push(`${p}:missing`);
    }
  }
  return parts.join("|");
}

export function readMergedJsonlLinesCached<T>(
  basePath: string,
  parse: (line: string) => T | null,
  opts?: { from?: string; to?: string }
): ReadJsonlResult<T> {
  const cacheKey = `${basePath}::${opts?.from ?? ""}::${opts?.to ?? ""}`;
  const signature = getMergedReadSignature(basePath, opts?.from, opts?.to);
  const hit = mergedCache.get(cacheKey) as MergedCacheEntry<T> | undefined;
  if (hit && hit.signature === signature) {
    return hit.result;
  }
  const result = readMergedJsonlLines(basePath, parse, opts);
  mergedCache.set(cacheKey, { signature, result });
  return result;
}

/** Test-only: clear merged-jsonl cache. */
export function clearMergedJsonlCache(): void {
  mergedCache.clear();
  clearJsonlCache();
}
