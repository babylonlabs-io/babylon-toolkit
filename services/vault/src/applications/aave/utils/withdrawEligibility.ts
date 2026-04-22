/**
 * Withdrawal eligibility and projected health factor helpers.
 *
 * Aave enforces HF >= 1.0 on withdrawal on-chain. These helpers mirror
 * that check client-side to drive UX: gating the outer Withdraw button,
 * greying out vaults that can't be individually released, and blocking
 * the review step's Confirm for combined selections that would revert.
 */

import { calculateHealthFactor } from "@babylonlabs-io/ts-sdk/tbv/integrations/aave";

import { WITHDRAW_HF_BLOCK_THRESHOLD } from "../constants";

/**
 * Tolerance for comparing projected health factors against thresholds.
 * Proportional USD scaling (vaultUsd = totalUsd * vaultBtc / totalBtc)
 * and the subsequent HF math run in float64, which introduces errors
 * on the order of 1e-13 near HF = 1.0. A slightly wider epsilon avoids
 * false negatives at the exact threshold — e.g., a withdrawal that
 * lands at HF = 1.0 computing as 0.9999999999 and being incorrectly
 * blocked.
 */
const HF_COMPARISON_EPSILON = 1e-9;

/**
 * True if `healthFactor` is at or above `threshold`, accounting for
 * float64 error from proportional scaling. Use this everywhere the UI
 * compares a projected HF against a threshold; direct `>=` / `<` can
 * spuriously reject a case the on-chain math would accept.
 */
export function isHealthFactorAtOrAbove(
  healthFactor: number,
  threshold: number,
): boolean {
  return healthFactor >= threshold - HF_COMPARISON_EPSILON;
}

export interface PositionSnapshot {
  /** Total collateral in BTC across the user's vaults. */
  collateralBtc: number;
  /** Total collateral in USD from Aave's oracle. */
  collateralValueUsd: number;
  /** Total debt in USD from Aave's oracle. */
  debtValueUsd: number;
  /** Liquidation threshold for the vBTC reserve in basis points. */
  liquidationThresholdBps: number;
}

/**
 * Convert a vault's BTC amount to its USD share of the total collateral.
 * Exact because every vault holds the same asset (vBTC) priced by one oracle.
 */
export function getVaultWithdrawalUsd(
  vaultBtc: number,
  collateralBtc: number,
  collateralValueUsd: number,
): number {
  if (collateralBtc <= 0) {
    throw new Error(
      "getVaultWithdrawalUsd: collateralBtc must be > 0 to compute proportional USD value",
    );
  }
  return (collateralValueUsd * vaultBtc) / collateralBtc;
}

/**
 * Health factor the user would land at after withdrawing `withdrawalValueUsd`
 * of collateral. Returns `Infinity` when there is no debt.
 */
export function computeProjectedHealthFactor(
  collateralValueUsd: number,
  withdrawalValueUsd: number,
  debtValueUsd: number,
  liquidationThresholdBps: number,
): number {
  const remainingCollateralUsd = Math.max(
    0,
    collateralValueUsd - withdrawalValueUsd,
  );
  return calculateHealthFactor(
    remainingCollateralUsd,
    debtValueUsd,
    liquidationThresholdBps,
  );
}

/**
 * True if the user could withdraw only this one vault without breaching
 * the on-chain HF floor (1.0). Used to grey out unsafe vaults in the picker.
 */
export function isVaultIndividuallyWithdrawable(
  vaultBtc: number,
  position: PositionSnapshot,
): boolean {
  if (position.collateralBtc <= 0) return false;
  const withdrawalUsd = getVaultWithdrawalUsd(
    vaultBtc,
    position.collateralBtc,
    position.collateralValueUsd,
  );
  const projectedHF = computeProjectedHealthFactor(
    position.collateralValueUsd,
    withdrawalUsd,
    position.debtValueUsd,
    position.liquidationThresholdBps,
  );
  return isHealthFactorAtOrAbove(projectedHF, WITHDRAW_HF_BLOCK_THRESHOLD);
}

/**
 * True if at least one in-use vault could be withdrawn individually
 * without breaching the HF floor. Gates the outer Withdraw button.
 */
export function canWithdrawAnyVault(
  vaults: readonly { amountBtc: number; inUse: boolean }[],
  position: PositionSnapshot,
): boolean {
  return vaults.some(
    (v) => v.inUse && isVaultIndividuallyWithdrawable(v.amountBtc, position),
  );
}
