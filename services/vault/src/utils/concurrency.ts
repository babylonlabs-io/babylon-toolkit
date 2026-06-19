/**
 * Run `task` over `items` with at most `concurrency` in flight; preserves
 * input order in the result array. Shared by the mempool batch pollers so
 * the public mempool.space endpoint's rate limit (429s) is respected.
 */
export async function mapWithConcurrency<T, R>(
  items: ReadonlyArray<T>,
  concurrency: number,
  task: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let nextIndex = 0;
  const workers = Array.from(
    { length: Math.min(concurrency, items.length) },
    async () => {
      while (true) {
        const i = nextIndex++;
        if (i >= items.length) return;
        results[i] = await task(items[i]);
      }
    },
  );
  await Promise.all(workers);
  return results;
}
