/**
 * Async utilities for polling and waiting operations
 */

export interface PollOptions {
  /** Interval between poll attempts in milliseconds */
  intervalMs: number;
  /** Maximum time to wait before timing out in milliseconds */
  timeoutMs: number;
  /** Function to determine if an error is transient (should continue polling) */
  isTransient?: (error: unknown) => boolean;
  /** AbortSignal for cancellation */
  signal?: AbortSignal;
}

/**
 * Generic polling utility with timeout and abort support.
 *
 * Polls until the provided function returns a non-null value,
 * times out, or is aborted.
 *
 * @param pollFn - Function that returns the result or null to continue polling
 * @param options - Polling configuration
 * @returns The result from pollFn when it returns a non-null value
 * @throws Error if timeout is reached, aborted, or a non-transient error occurs
 *
 * @example
 * ```ts
 * const result = await pollUntil(
 *   async () => {
 *     const data = await fetchData();
 *     return data.ready ? data : null;
 *   },
 *   { intervalMs: 5000, timeoutMs: 60000 }
 * );
 * ```
 */
export async function pollUntil<T>(
  pollFn: () => Promise<T | null>,
  options: PollOptions,
): Promise<T> {
  const { intervalMs, timeoutMs, isTransient = () => false, signal } = options;
  const startTime = Date.now();

  while (true) {
    if (signal?.aborted) {
      throw new Error("Polling aborted");
    }

    if (Date.now() - startTime >= timeoutMs) {
      throw new Error("Polling timeout");
    }

    try {
      const result = await pollFn();
      if (result !== null) {
        return result;
      }
    } catch (error) {
      if (!isTransient(error)) {
        throw error;
      }
      // Transient errors: continue polling
    }

    // Wait before next poll, with abort support
    await new Promise<void>((resolve, reject) => {
      const timeoutId = setTimeout(resolve, intervalMs);
      signal?.addEventListener(
        "abort",
        () => {
          clearTimeout(timeoutId);
          reject(new Error("Polling aborted"));
        },
        { once: true },
      );
    });
  }
}
