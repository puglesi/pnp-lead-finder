export function settingsDayKey(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

export function computeAutonomousDailySentCount(
  sentDate: string,
  sentCount: number,
  today = settingsDayKey()
): number {
  if (!Number.isFinite(sentCount)) return 0;
  return sentDate === today ? Math.max(0, sentCount) : 0;
}

/** Pure remaining: a stale date is treated as a new day without writing state. */
export function computeAutonomousDailyRemaining(
  sentDate: string,
  sentCount: number,
  limit: number,
  today = settingsDayKey()
): number {
  if (!(limit > 0)) return Number.POSITIVE_INFINITY;
  return Math.max(
    0,
    limit - computeAutonomousDailySentCount(sentDate, sentCount, today)
  );
}
