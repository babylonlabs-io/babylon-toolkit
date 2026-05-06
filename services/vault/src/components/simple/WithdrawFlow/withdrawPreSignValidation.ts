/**
 * Pre-sign validation for the simple withdraw flow.
 *
 * The review dialog computes its projected health factor from cached
 * `aaveUserPosition` data that refreshes on a 30s interval. Between
 * refreshes, oracle / debt / collateral movement can put the live HF below
 * the on-chain block threshold (1.0) while the dialog still shows a
 * comfortable cached HF. This module reruns the projected-HF check against
 * a freshly fetched position immediately before broadcast and throws if
 * the block threshold would be crossed — aborting the in-flight Confirm
 * before a transaction the contract would revert.
 *
 * The [1.0, 1.1) warning band is intentionally NOT enforced here. It is a
 * UI advisory: `WithdrawReviewContent` surfaces it via `isAtRisk` while
 * leaving Confirm enabled. The refetch run by this validator updates the
 * React Query cache, so when the dialog re-renders it reflects the fresh
 * HF and the right warning copy. Throwing on the warn band would create
 * an infinite loop — the user could never legitimately accept the risk
 * because every subsequent click would re-run this validator against the
 * same fresh data.
 */

import { WITHDRAW_HF_BLOCK_THRESHOLD } from "@/applications/aave/constants";
import { WithdrawPreSignValidationError } from "@/applications/aave/hooks/withdrawPreSignValidationError";
import type { AavePositionWithLiveData } from "@/applications/aave/services";
import {
  computeProjectedHealthFactor,
  isHealthFactorAtOrAbove,
  wadToNumber,
} from "@/applications/aave/utils";
import { satoshiToBtcNumber } from "@/utils/btcConversion";

export const WITHDRAW_BLOCK_BREACH_MESSAGE = `Position data has changed. This withdrawal would drop your health factor below ${WITHDRAW_HF_BLOCK_THRESHOLD.toFixed(1)} and be rejected on-chain. Reduce the selection or repay debt first.`;

/**
 * Validate a freshly fetched position against a withdrawal selection.
 * Throws `WithdrawPreSignValidationError` when the projected HF would
 * breach the on-chain block threshold (1.0). Returns silently when:
 *   - `fresh` is null (no position / no debt — nothing to threaten),
 *   - `borrowCount === 0n` (no debt — projected HF is +Infinity),
 *   - or the projected HF is at or above the block threshold.
 */
export function validateFreshWithdraw(
  fresh: AavePositionWithLiveData | null,
  selectedBtc: number,
): void {
  if (!fresh) return;

  const freshCurrentHF =
    fresh.accountData.borrowCount > 0n
      ? wadToNumber(fresh.accountData.healthFactor)
      : null;
  const freshCollateralBtc = satoshiToBtcNumber(fresh.totalCollateral);
  const freshProjectedHF = computeProjectedHealthFactor(
    freshCurrentHF,
    freshCollateralBtc,
    selectedBtc,
  );

  if (!isHealthFactorAtOrAbove(freshProjectedHF, WITHDRAW_HF_BLOCK_THRESHOLD)) {
    throw new WithdrawPreSignValidationError(WITHDRAW_BLOCK_BREACH_MESSAGE);
  }
}
