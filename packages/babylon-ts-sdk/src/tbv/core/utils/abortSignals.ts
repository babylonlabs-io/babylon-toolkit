/**
 * AbortSignal composition helpers.
 *
 * @module utils/abortSignals
 */

export interface CombinedAbortSignal {
  signal: AbortSignal;
  /** Remove listeners from the source signals. Call once the request settles. */
  cleanup: () => void;
}

/**
 * Compose several AbortSignals into one that aborts when any input aborts,
 * propagating the reason of whichever fired first.
 *
 * Deliberately does NOT use `AbortSignal.any`: that shipped in Chrome 116 /
 * Safari 17.4, newer than the browsers this SDK is consumed from, and it is a
 * runtime API so no transpile step can backfill it. Calling it directly threw
 * `TypeError: AbortSignal.any is not a function` before `fetch` was ever
 * reached, which failed UTXO fetches, fee estimation and transaction broadcast
 * outright on those browsers.
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
