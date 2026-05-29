// Peg-out ETA helpers. The payout wait is the vault's `timelockAssert` (BTC
// blocks) — see btc-vault payout.rs. Display-only.

/** Largest `timelockAssert` (blocks) across a batch; unresolved/undefined
 *  versions fall back to `fallbackBlocks` so they never understate. Empty
 *  input returns 0 (no selection → no wait). */
export function maxAssertTimelockBlocks(
  versions: Array<number | undefined>,
  resolveTimelockAssert: (version: number) => bigint | undefined,
  fallbackBlocks: number,
): number {
  let max = 0;
  for (const version of versions) {
    const timelock =
      version !== undefined ? resolveTimelockAssert(version) : undefined;
    const blocks = timelock !== undefined ? Number(timelock) : fallbackBlocks;
    if (blocks > max) max = blocks;
  }
  return max;
}

/** Minutes until payout: (timelockAssert − Assert-tx confirmations) × blockTime,
 *  clamped at 0. Assert-tx confirmations are the BIP68 CSV clock. */
export function payoutEtaMinutes(
  timelockAssertBlocks: number,
  assertConfirmations: number,
  blockTimeMins: number,
): number {
  const remainingBlocks = Math.max(
    0,
    timelockAssertBlocks - assertConfirmations,
  );
  return remainingBlocks * blockTimeMins;
}
