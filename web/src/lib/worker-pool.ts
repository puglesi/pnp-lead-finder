export async function runWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>,
  onItemComplete?: (result: R, index: number) => void
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let nextIndex = 0;

  async function runWorker() {
    while (nextIndex < items.length) {
      const index = nextIndex++;
      const item = items[index];
      const result = await worker(item, index);
      results[index] = result;
      onItemComplete?.(result, index);
    }
  }

  const poolSize = Math.max(1, Math.min(concurrency, items.length));
  const workers = await Promise.allSettled(
    Array.from({ length: poolSize }, () => runWorker())
  );
  const rejected = workers.find(
    (worker): worker is PromiseRejectedResult => worker.status === "rejected"
  );
  if (rejected) throw rejected.reason;
  return results;
}

export function parseSectors(input: string): string[] {
  return input
    .split(/[,;\n]+|→|->|—/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function formatSectorQueue(sectors: string[]): string {
  return sectors.join(" → ");
}
