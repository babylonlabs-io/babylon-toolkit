/**
 * Whether a deposit fits, and whether it may be split, given two independent
 * on-chain caps. Drives the deposit-flow behaviour:
 *
 * - **At cap** — a single vault no longer fits: block the deposit.
 * - **Near cap** — a single vault fits but a 2-vault split would overflow the
 *   per-position cap: keep the deposit, force a single vault.
 * - **HTLC output cap** — the protocol allows fewer HTLC outputs in one
 *   Pre-PegIn than a split needs: force a single vault, whatever the
 *   per-position cap says.
 *
 * The two caps are unrelated and are enforced by different contracts, but they
 * answer the same question for the form, so they resolve here together. The
 * HTLC cap matters beyond the form: `assertBuildWithinPinnedLimits` re-checks
 * it against the pinned read and aborts the build, and its message tells the
 * depositor to start again without splitting. That instruction is only
 * followable if the form stops offering the split — otherwise the reopened form
 * re-enables it and the next attempt fails identically.
 *
 * Pure and side-effect free so it can be unit-tested and reused across the
 * submit guard, the CTA state, and the inline hint.
 */

/** HTLC outputs a two-BTCVault split puts in one Pre-PegIn — one per BTCVault. */
const HTLC_OUTPUTS_PER_SPLIT_DEPOSIT = 2;

export interface VaultCapStateParams {
  /** Number of BTC Vaults the position already holds. */
  existingVaultCount: number;
  /** On-chain cap, or `null` when unknown (loading / unavailable). */
  maxVaultsPerPosition: number | null;
  /** Whether cap enforcement is active (the liquidation-notifications flag). */
  enabled: boolean;
  /**
   * `ProtocolParams.maxHtlcOutputCount` — HTLC outputs allowed in one
   * Pre-PegIn. Validated to `[1, 255]` on read, so it is never zero here.
   */
  maxHtlcOutputCount: number;
}

/**
 * Why a split is not on offer, or `null` when it is.
 *
 * A discriminated reason rather than a boolean because the two causes need
 * different explanations: the per-position one can quote "N of M BTCVaults
 * used", and the protocol one cannot — the position may be empty and the cap
 * may be unknown. Collapsing them showed a depositor at 0 of 10 vaults a hint
 * blaming a cap they were nowhere near.
 */
export type SplitUnavailableReason = "per-position" | "htlc-output-cap";

export interface VaultCapState {
  /** Even a single new vault would exceed the cap — block the deposit. */
  isAtCap: boolean;
  /** Why a 2-vault split is unavailable, or `null` when it is available. */
  splitUnavailableReason: SplitUnavailableReason | null;
}

export function resolveVaultCapState({
  existingVaultCount,
  maxVaultsPerPosition,
  enabled,
  maxHtlcOutputCount,
}: VaultCapStateParams): VaultCapState {
  // Applies whatever the per-position cap says, and whether or not that cap is
  // enforced — it is a different contract's limit, gated by a different flag.
  const htlcReason: SplitUnavailableReason | null =
    maxHtlcOutputCount < HTLC_OUTPUTS_PER_SPLIT_DEPOSIT
      ? "htlc-output-cap"
      : null;

  if (!enabled || maxVaultsPerPosition == null) {
    return { isAtCap: false, splitUnavailableReason: htlcReason };
  }
  const isAtCap = existingVaultCount + 1 > maxVaultsPerPosition;
  if (isAtCap) {
    // The deposit is blocked outright, so there is no split to explain.
    return { isAtCap, splitUnavailableReason: null };
  }
  // Per-position is reported first: it is the one that can quote usage, and the
  // depositor can act on it by withdrawing a vault.
  const perPositionReason: SplitUnavailableReason | null =
    existingVaultCount + 2 > maxVaultsPerPosition ? "per-position" : null;
  return {
    isAtCap,
    splitUnavailableReason: perPositionReason ?? htlcReason,
  };
}
