/**
 * Stable "Started at" anchor for the BTC confirmation-depth panel on the
 * resume paths (`PostDepositContinuationView`, `ResumeWotsContent`).
 *
 * Two-function split so the cache write happens only at commit-time:
 *
 * - `getBtcDepthStartedAt` is render-safe (pure read).
 * - `commitBtcDepthStartedAt` mutates the cache and must be called from a
 *   useEffect / event handler / other post-commit path. Calling it during
 *   render would let a discarded/abandoned render (StrictMode double-invoke,
 *   suspended render, etc.) pollute the cache with a timestamp that was
 *   never observed by the user.
 *
 * Write-once semantics: the first committed write for a given vault id wins.
 * Subsequent calls with the same id are no-ops, so concurrent renders racing
 * to commit cannot move the anchor forward in time.
 *
 * The cache is module-level so the anchor survives component unmount
 * (modal close / reopen) and vault switches return their own anchors.
 *
 * The active deposit flow uses its own anchor (broadcast time captured in
 * `useDepositFlow`) and does not use this helper.
 */
const cache = new Map<string, number>();

export function getBtcDepthStartedAt(vaultId: string): number | undefined {
  return cache.get(vaultId);
}

export function commitBtcDepthStartedAt(
  vaultId: string,
  timestamp: number,
): void {
  if (!cache.has(vaultId)) {
    cache.set(vaultId, timestamp);
  }
}
