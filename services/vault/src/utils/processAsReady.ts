/**
 * Run a readiness `wait` for every item concurrently, then invoke `process` for
 * each item serially in the order its wait settles (resolved or rejected).
 *
 * `process` calls never overlap, so it is safe for a serialized resource such as
 * wallet signing popups. Concurrency only covers the read-only `wait` phase — a
 * slow item never blocks a ready sibling, but no two items sign at once.
 *
 * A `wait` rejection is delivered to `process` as `waitError` (otherwise null) so
 * the caller can mark that item failed and continue with the rest, rather than
 * aborting the whole batch. If `process` itself throws, the error propagates and
 * the remaining (read-only) waits are abandoned — pass an AbortSignal into `wait`
 * so they unwind.
 */
export async function processAsReady<T>(
  items: readonly T[],
  wait: (item: T) => Promise<void>,
  process: (item: T, waitError: unknown) => Promise<void>,
): Promise<void> {
  const remaining = new Map<T, Promise<{ item: T; waitError: unknown }>>();
  for (const item of items) {
    remaining.set(
      item,
      wait(item).then(
        () => ({ item, waitError: null }),
        (waitError: unknown) => ({ item, waitError }),
      ),
    );
  }

  while (remaining.size > 0) {
    const { item, waitError } = await Promise.race(remaining.values());
    remaining.delete(item);
    await process(item, waitError);
  }
}
