export const MAX_API_PAGE_SIZE = 100;
export const MAX_API_DATE_SPAN_DAYS = 90;
/** Soft ceiling when a client requests truncation; omit limit = return all. */
export const MAX_API_WORD_LIMIT = 100_000;
export const MAX_API_PHRASE_LIMIT = 100_000;
export const DEFAULT_SESSIONS_LOOKBACK_DAYS = 90;

function parseDateKey(s: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const d = new Date(`${s}T00:00:00.000Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function todayDateKey(): string {
  return new Date().toISOString().slice(0, 10);
}

export function dateKeyDaysAgo(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

export function clampPageSize(value: number, fallback = 20): number {
  if (!Number.isFinite(value) || value < 1) return fallback;
  return Math.min(Math.floor(value), MAX_API_PAGE_SIZE);
}

export function clampLimit(
  value: number,
  fallback: number,
  max: number
): number {
  if (!Number.isFinite(value) || value < 1) return fallback;
  return Math.min(Math.floor(value), max);
}

/**
 * Normalize from/to with a maximum span. When only one bound is set, fills the other.
 * Returns ISO date keys (YYYY-MM-DD).
 */
export function normalizeDateRange(
  from?: string,
  to?: string,
  opts?: { maxSpanDays?: number; defaultSpanDays?: number }
): { from?: string; to?: string } {
  const maxSpan = opts?.maxSpanDays ?? MAX_API_DATE_SPAN_DAYS;
  const defaultSpan = opts?.defaultSpanDays;

  let fromKey = from;
  let toKey = to ?? todayDateKey();

  if (!fromKey && defaultSpan != null) {
    fromKey = dateKeyDaysAgo(defaultSpan);
  }

  if (fromKey && !to) {
    toKey = todayDateKey();
  }

  if (fromKey) {
    const fromDate = parseDateKey(fromKey);
    const toDate = parseDateKey(toKey);
    if (fromDate && toDate && fromDate > toDate) {
      [fromKey, toKey] = [toKey, fromKey];
    }
  }

  if (fromKey && toKey) {
    const fromDate = parseDateKey(fromKey);
    const toDate = parseDateKey(toKey);
    if (fromDate && toDate) {
      const spanMs = toDate.getTime() - fromDate.getTime();
      const maxMs = maxSpan * 24 * 60 * 60 * 1000;
      if (spanMs > maxMs) {
        const clamped = new Date(toDate.getTime() - maxMs);
        fromKey = clamped.toISOString().slice(0, 10);
      }
    }
  }

  return { from: fromKey, to: toKey };
}
