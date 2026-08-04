export interface CombinedAbortSignal {
  signal: AbortSignal;
  /** Remove listeners from the source signals. Call once the request settles. */
  cleanup: () => void;
}

/**
 * Compose several AbortSignals into one that aborts when any input aborts.
 *
 * Deliberately does NOT use `AbortSignal.any`: that shipped in Chrome 116 /
 * Safari 17.4, which is newer than this app's build target, and it is a runtime
 * API so no transpile step can backfill it. Calling it directly threw
 * `TypeError: AbortSignal.any is not a function` before `fetch` was ever
 * reached, failing every request on older browsers.
 */
export function combineAbortSignals(
  signals: AbortSignal[],
): CombinedAbortSignal {
  const noop = () => {};

  const alreadyAborted = signals.find((signal) => signal.aborted);
  if (alreadyAborted) return { signal: alreadyAborted, cleanup: noop };
  if (signals.length === 1) return { signal: signals[0], cleanup: noop };

  const controller = new AbortController();
  const listeners = signals.map((source) => {
    const onAbort = () => controller.abort(source.reason);
    source.addEventListener("abort", onAbort, { once: true });
    return { source, onAbort };
  });

  const cleanup = () => {
    for (const { source, onAbort } of listeners) {
      source.removeEventListener("abort", onAbort);
    }
  };

  return { signal: controller.signal, cleanup };
}

export function abortableSleep(
  ms: number,
  signal?: AbortSignal,
): Promise<void> {
  if (ms <= 0) return Promise.resolve();

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);

    const onAbort = () => {
      clearTimeout(timeout);
      reject(signal?.reason ?? new DOMException("Aborted", "AbortError"));
    };

    if (signal) {
      if (signal.aborted) {
        onAbort();
        return;
      }
      signal.addEventListener("abort", onAbort, { once: true });
    }
  });
}
