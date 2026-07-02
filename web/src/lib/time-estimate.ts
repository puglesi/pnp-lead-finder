export function formatDuration(ms: number): string {
  if (ms < 1000) return "< 1s";
  const seconds = Math.ceil(ms / 1000);
  if (seconds < 60) return `~${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const rem = seconds % 60;
  return rem > 0 ? `~${minutes}m ${rem}s` : `~${minutes}m`;
}

export function estimateRemainingMs(
  completed: number,
  total: number,
  elapsedMs: number,
  workers: number
): number {
  if (total === 0 || completed >= total) return 0;
  if (completed === 0) {
    const perSector = 1500;
    const batches = Math.ceil(total / Math.max(1, workers));
    return batches * perSector;
  }
  const avgPerSector = elapsedMs / completed;
  const remaining = total - completed;
  const batches = Math.ceil(remaining / Math.max(1, workers));
  return batches * avgPerSector;
}