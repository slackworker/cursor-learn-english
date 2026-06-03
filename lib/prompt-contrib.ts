export type ContributionCell = {
  date: string | null;
  count: number;
};

/** GitHub-style grid: each column is a week (Sun–Sat), oldest left. */
export function buildContributionWeeks(
  byDay: Record<string, number>,
  daysBack = 364
): ContributionCell[][] {
  const end = new Date();
  end.setUTCHours(12, 0, 0, 0);
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - daysBack);

  const padStart = new Date(start);
  padStart.setUTCDate(padStart.getUTCDate() - padStart.getUTCDay());

  const days: ContributionCell[] = [];
  const cur = new Date(padStart);
  while (cur <= end) {
    const dateKey = cur.toISOString().slice(0, 10);
    const inRange = cur >= start && cur <= end;
    days.push({
      date: inRange ? dateKey : null,
      count: inRange ? (byDay[dateKey] ?? 0) : 0,
    });
    cur.setUTCDate(cur.getUTCDate() + 1);
  }

  const weeks: ContributionCell[][] = [];
  for (let i = 0; i < days.length; i += 7) {
    weeks.push(days.slice(i, i + 7));
  }
  return weeks;
}

export function contributionLevel(count: number, max: number): 0 | 1 | 2 | 3 | 4 {
  if (count <= 0) return 0;
  if (max <= 1) return 4;
  const ratio = count / max;
  if (ratio <= 0.25) return 1;
  if (ratio <= 0.5) return 2;
  if (ratio <= 0.75) return 3;
  return 4;
}
