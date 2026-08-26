/**
 * Withdrawal eligibility and projected health factor helpers.
 *
 * Aave enforces HF >= 1.0 on withdrawal on-chain. These helpers mirror
 * that check client-side to drive UX: gating the outer Withdraw button,
 * greying out vaults that can't be individually released, and blocking
 * the review step's Confirm for combined selections that would revert.
 *
 * We project HF by scaling Aave's authoritative on-chain health factor,
 * not by re-deriving it from collateral/debt USD. All vaults hold the
 * same asset (vBTC) priced by one oracle, so the ratio of remaining
 * collateral BTC to total collateral BTC equals the ratio in USD, and
 * HF is linear in that ratio when debt and liquidation threshold are
 * held constant. Using on-chain HF as the baseline avoids replicating
 * the contract's math (which has had unit-mismatch surprises in debt
 * values) and guarantees we agree with the reading the user sees.
 */

import {
  WITHDRAW_HF_BLOCK_THRESHOLD,
  WITHDRAW_HF_WARNING_THRESHOLD,
} from "../constants";

/**
 * Tolerance for comparing projected health factors against thresholds.
 * Proportional scaling runs in float64 and can produce a value a few
 * ULPs below the intended result (e.g. `0.9999999999` for a true 1.0).
 * A slightly wider epsilon avoids false negatives at the exact threshold.
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
  /**
   * User's current on-chain health factor, or null when they have no debt.
   * This is the authoritative value the contract reports; we scale it to
   * project post-withdrawal HF.
   */
  currentHealthFactor: number | null;
}

/**
 * Health factor the user would land at after withdrawing `withdrawalBtc`
 * of collateral. Returns `Infinity` when there is no debt.
 *
 * Derivation: HF = collateral × LT / debt. Holding LT and debt constant,
 * HF is proportional to collateral, so projectedHF = currentHF × (remaining
 * / total). BTC ratio equals USD ratio because every vault is vBTC at one
 * oracle price.
 */
export function computeProjectedHealthFactor(
  currentHealthFactor: number | null,
  collateralBtc: number,
  withdrawalBtc: number,
): number {
  if (currentHealthFactor === null) return Infinity;
  if (collateralBtc <= 0) return 0;
  const remainingBtc = Math.max(0, collateralBtc - withdrawalBtc);
  return currentHealthFactor * (remainingBtc / collateralBtc);
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
  const projectedHF = computeProjectedHealthFactor(
    position.currentHealthFactor,
    position.collateralBtc,
    vaultBtc,
  );
  return isHealthFactorAtOrAbove(projectedHF, WITHDRAW_HF_BLOCK_THRESHOLD);
}

export interface WithdrawHfWarningState {
  /** Projected HF would breach the on-chain block threshold; Confirm must be disabled. */
  wouldBreachHF: boolean;
  /** Projected HF sits between the block and warning thresholds; surface an at-risk warning. */
  isAtRisk: boolean;
}

/**
 * Classify the projected health factor into the UI states the withdraw
 * flow surfaces (block / at-risk / safe). Selector and review both depend
 * on this, so it lives here as the single source of truth.
 */
export function getWithdrawHfWarningState(
  projectedHealthFactor: number,
): WithdrawHfWarningState {
  const wouldBreachHF = !isHealthFactorAtOrAbove(
    projectedHealthFactor,
    WITHDRAW_HF_BLOCK_THRESHOLD,
  );
  const isAtRisk =
    !wouldBreachHF &&
    !isHealthFactorAtOrAbove(
      projectedHealthFactor,
      WITHDRAW_HF_WARNING_THRESHOLD,
    );
  return { wouldBreachHF, isAtRisk };
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
