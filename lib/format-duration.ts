/** Format a millisecond span for display (seconds, minutes, or hours). */
export function formatDurationMs(ms?: number): string {
  if (ms == null || ms < 0) return "—";
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  if (ms < 3_600_000) return `${(ms / 60_000).toFixed(1)}min`;
  const hours = ms / 3_600_000;
  return hours < 10 ? `${hours.toFixed(1)}h` : `${Math.round(hours)}h`;
}

/** Wall-clock span between two ISO timestamps (inclusive of endpoints). */
export function spanDurationMs(start?: string, end?: string): number | undefined {
  if (!start || !end) return undefined;
  const t0 = Date.parse(start);
  const t1 = Date.parse(end);
  if (!Number.isFinite(t0) || !Number.isFinite(t1) || t1 < t0) return undefined;
  return t1 - t0;
}
