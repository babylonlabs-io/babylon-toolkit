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

function isAbortError(error: unknown): boolean {
  return (
    error != null &&
    typeof error === "object" &&
    "name" in error &&
    error.name === "AbortError"
  );
}

/**
 * A browser `fetch` rejection carries no endpoint information — the exception is
 * literally `TypeError: Failed to fetch` (`Load failed` on Safari), so every
 * failing request produces an identical, untriageable Sentry issue. Naming the
 * host restores enough context to tell an indexer outage apart from an RPC or
 * mempool one, without leaking the query or its variables.
 */
function describeFetchFailure(
  requestLabel: string,
  url: string,
  error: unknown,
): Error {
  const host = (() => {
    try {
      return new URL(url).host;
    } catch {
      return "unknown host";
    }
  })();
  const detail = error instanceof Error ? error.message : String(error);
  return new Error(`${requestLabel} to ${host} failed: ${detail}`, {
    cause: error,
  });
}

export interface WithRequestTimeoutOptions {
  /** Abort the request after this many ms and classify the failure as a timeout. */
  timeoutMs: number;
  /** Caller-supplied abort signal (e.g. React Query unmount), composed with the timeout signal. */
  signal?: AbortSignal;
  /** Prefixes every thrown error, e.g. "GraphQL request" or "Borrow rate history request". */
  requestLabel: string;
  /** Request URL — named in a generic-failure message always, in the timeout message when `includeUrlInTimeoutMessage` is set. */
  url: string;
  /** Include the full request URL in the timeout error message. Off by default. */
  includeUrlInTimeoutMessage?: boolean;
}

/**
 * Run `request` under a timeout composed with an optional caller-supplied
 * abort signal, classifying a failure as one of a fired timeout, a
 * caller-initiated abort (rethrown as-is so downstream `name ===
 * "AbortError"` checks still see a cancellation, not a fault), or a generic
 * network failure (renamed with the request's host — see
 * `describeFetchFailure`).
 *
 * `request` gets the composed signal and must do its ENTIRE request inside
 * it — the fetch call and any body consumption (`.text()`/`.json()`) both
 * need to run under the same signal/timer, since a stalled body is exactly
 * the kind of hang a request timeout exists to bound. Callers keep whatever
 * they do around that (rebuilding the Response, parsing JSON, validating the
 * payload) — this only owns the timer/signal/abort-classification core that
 * both API clients used to duplicate.
 */
export async function withRequestTimeout<T>(
  {
    timeoutMs,
    signal,
    requestLabel,
    url,
    includeUrlInTimeoutMessage = false,
  }: WithRequestTimeoutOptions,
  request: (composedSignal: AbortSignal) => Promise<T>,
): Promise<T> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  const signals = [controller.signal, signal].filter(
    (s): s is AbortSignal => s != null,
  );
  const combined = combineAbortSignals(signals);

  try {
    return await request(combined.signal);
  } catch (error) {
    if (controller.signal.aborted && isAbortError(error)) {
      throw new Error(
        includeUrlInTimeoutMessage
          ? `${requestLabel} to ${url} timed out after ${timeoutMs}ms`
          : `${requestLabel} timed out after ${timeoutMs}ms`,
      );
    }
    // A caller-initiated abort (e.g. React Query unmount) must stay an
    // AbortError so downstream `name === "AbortError"` checks keep treating
    // it as a cancellation rather than a fault.
    if (isAbortError(error)) {
      throw error;
    }
    throw describeFetchFailure(requestLabel, url, error);
  } finally {
    clearTimeout(timeoutId);
    combined.cleanup();
  }
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
