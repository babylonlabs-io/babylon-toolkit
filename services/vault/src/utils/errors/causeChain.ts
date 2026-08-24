/**
 * The single `cause`-chain walk shared by the error classifiers
 * (userCancellation.ts, deviceErrors.ts, walletMethodNotSupported.ts,
 * formatting.ts) so their depth bound and walk semantics cannot drift apart.
 *
 * Deliberately dependency-free: `sentry.client.config.ts` imports
 * userCancellation.ts at telemetry-init time, so nothing here may import
 * COPY, the SDK, or the wallet-connector bundle.
 */

/** How far to walk a `cause` chain before giving up. */
export const MAX_CAUSE_DEPTH = 10;

/**
 * True when the error — or anything in its `cause` chain — matches the frame
 * predicate. The predicate sees every frame, including non-object frames
 * (some wallet adapters reject with a bare string as a wrapper's `cause`);
 * the walk itself stops at the first non-object frame after testing it.
 */
export function chainMatchesFrame(
  error: unknown,
  matchesFrame: (frame: unknown) => boolean,
): boolean {
  let cur: unknown = error;

  for (let depth = 0; depth <= MAX_CAUSE_DEPTH && cur != null; depth++) {
    if (matchesFrame(cur)) return true;

    if (typeof cur !== "object") return false;

    cur = (cur as { cause?: unknown }).cause;
  }

  return false;
}

/**
 * True when the error or its `cause` chain carries the given `code`.
 * Cause-walking: callers must run it AFTER their typed top-frame buckets so
 * an inner code never shadows a more specific outer error.
 */
export function chainCarriesCode(error: unknown, code: string): boolean {
  return chainMatchesFrame(
    error,
    (frame) =>
      frame !== null &&
      typeof frame === "object" &&
      (frame as { code?: unknown }).code === code,
  );
}
