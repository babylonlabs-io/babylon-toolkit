/**
 * Repay action validation
 *
 * Validates whether user can perform the repay action based on amount.
 */

import { COPY } from "@/copy";

import {
  formatDisplayAmount,
  formatTokenAmount,
} from "../../../../../../utils/formatting";

export interface RepayValidationResult {
  isDisabled: boolean;
  buttonText: string;
  errorMessage: string | null;
  /**
   * Non-blocking informational message — surfaced when the action is allowed
   * but the user should know about a constraint (e.g. balance < debt means
   * a successful repay will still leave a residual).
   */
  warningMessage: string | null;
}

/**
 * Validates whether the repay action is allowed.
 *
 * @param repayAmount - Amount user wants to repay
 * @param maxRepayAmount - Maximum repay amount (min of debt and balance)
 * @param currentDebtAmount - Current debt amount (optional, for better error messages)
 * @param userTokenBalance - User's token balance (optional, for better error messages)
 * @param displayDecimals - Token's display precision; messages format at it so
 *   dust isn't shown as "0.00", and amounts below one base unit are rejected.
 * @param symbol - Token symbol, shown in the error description (e.g. "DAI")
 * @returns Validation result with disabled state, button text, and error/warning messages
 */
export function validateRepayAction(
  repayAmount: number,
  maxRepayAmount: number,
  currentDebtAmount?: number,
  userTokenBalance?: number,
  displayDecimals?: number,
  symbol = "",
): RepayValidationResult {
  // Below one base unit the submit path's toFixed(displayDecimals) rounds to 0n
  // and the tx reverts, so block it (mirrors the borrow sub-unit guard).
  if (repayAmount > 0 && displayDecimals !== undefined) {
    const minRepayable = 1 / 10 ** displayDecimals; // one base unit at this precision
    if (repayAmount < minRepayable) {
      return {
        isDisabled: true,
        buttonText: "Amount too small",
        errorMessage: COPY.loans.validation.minRepay(
          formatTokenAmount(minRepayable, displayDecimals),
        ),
        warningMessage: null,
      };
    }
  }

  // Independent of the typed amount: if the user's balance is less than the
  // outstanding debt, surface that up front so a max-repay doesn't silently
  // leave the user with residual debt and no clear next step.
  const balanceShortfall =
    userTokenBalance !== undefined &&
    currentDebtAmount !== undefined &&
    userTokenBalance > 0 &&
    userTokenBalance < currentDebtAmount;

  // Use `formatTokenAmount` for all three numbers so the precision per number
  // is adaptive (min 2, max 6 decimals, trailing zeros trimmed). A blanket
  // `.toFixed(2)` would hide sub-cent dust ("leave 0.000001 in debt" → "0.00"),
  // producing a self-contradicting message. A blanket `.toFixed(6)` would
  // pad normal amounts with noisy zeros.
  const shortfallMessage = balanceShortfall
    ? `Your balance (${formatTokenAmount(userTokenBalance as number, displayDecimals)}) is less than your debt (${formatTokenAmount(currentDebtAmount as number, displayDecimals)}). Repaying now will leave ${formatTokenAmount((currentDebtAmount as number) - (userTokenBalance as number), displayDecimals)} in debt; acquire more tokens to fully clear it.`
    : null;

  if (repayAmount === 0) {
    return {
      isDisabled: true,
      buttonText: "Enter an amount",
      errorMessage: null,
      warningMessage: shortfallMessage,
    };
  }

  if (repayAmount > maxRepayAmount) {
    if (balanceShortfall) {
      return {
        isDisabled: true,
        buttonText: "Insufficient balance",
        errorMessage: COPY.loans.validation.insufficientBalance(
          formatDisplayAmount(userTokenBalance as number, displayDecimals ?? 2),
          symbol,
        ),
        warningMessage: null,
      };
    }
    return {
      isDisabled: true,
      buttonText: "Amount exceeds debt",
      errorMessage: COPY.loans.validation.amountExceedsDebt,
      warningMessage: null,
    };
  }

  return {
    isDisabled: false,
    buttonText: "Repay",
    errorMessage: null,
    warningMessage: shortfallMessage,
  };
}
