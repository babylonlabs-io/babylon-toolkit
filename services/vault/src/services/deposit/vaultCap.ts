/**
 * Per-position BTC Vault cap logic, derived from the on-chain
 * `maxVaultsPerPosition` parameter. Drives the deposit-flow behaviour:
 *
 * - **At cap** — a single vault no longer fits: block the deposit.
 * - **Near cap** — a single vault fits but a 2-vault split would overflow:
 *   keep the deposit, force a single vault (split unavailable).
 *
 * Pure and side-effect free so it can be unit-tested and reused across the
 * submit guard, the CTA state, and the inline hint.
 */

export interface VaultCapStateParams {
  /** Number of BTC Vaults the position already holds. */
  existingVaultCount: number;
  /** On-chain cap, or `null` when unknown (loading / unavailable). */
  maxVaultsPerPosition: number | null;
  /** Whether cap enforcement is active (the liquidation-notifications flag). */
  enabled: boolean;
}

export interface VaultCapState {
  /** Even a single new vault would exceed the cap — block the deposit. */
  isAtCap: boolean;
  /** A single fits but a 2-vault split would exceed the cap — force single. */
  isSplitUnavailable: boolean;
}

export function resolveVaultCapState({
  existingVaultCount,
  maxVaultsPerPosition,
  enabled,
}: VaultCapStateParams): VaultCapState {
  if (!enabled || maxVaultsPerPosition == null) {
    return { isAtCap: false, isSplitUnavailable: false };
  }
  const isAtCap = existingVaultCount + 1 > maxVaultsPerPosition;
  const isSplitUnavailable =
    !isAtCap && existingVaultCount + 2 > maxVaultsPerPosition;
  return { isAtCap, isSplitUnavailable };
}
