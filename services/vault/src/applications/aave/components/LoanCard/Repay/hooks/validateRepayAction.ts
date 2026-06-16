/**
 * Repay action validation
 *
 * Validates whether user can perform the repay action based on amount.
 */

import { COPY } from "@/copy";

import { formatTokenAmount } from "../../../../../../utils/formatting";

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
 * @param symbol - Repay token symbol (e.g. "WBTC"); named in messages instead
 *   of a generic "tokens". Falls back to "tokens" when omitted.
 * @returns Validation result with disabled state, button text, and error/warning messages
 */
export function validateRepayAction(
  repayAmount: number,
  maxRepayAmount: number,
  currentDebtAmount?: number,
  userTokenBalance?: number,
  displayDecimals?: number,
  symbol?: string,
): RepayValidationResult {
  const copy = COPY.loans.repay;
  const tokenUnit = symbol ?? "tokens";

  // Below one base unit the submit path's toFixed(displayDecimals) rounds to 0n
  // and the tx reverts, so block it (mirrors the borrow sub-unit guard).
  if (repayAmount > 0 && displayDecimals !== undefined) {
    const minRepayable = 1 / 10 ** displayDecimals; // one base unit at this precision
    if (repayAmount < minRepayable) {
      return {
        isDisabled: true,
        buttonText: copy.amountTooSmall,
        errorMessage: copy.minRepayable(
          formatTokenAmount(minRepayable, displayDecimals),
        ),
        warningMessage: null,
      };
    }
  }

  // Outstanding debt but zero tokens to repay with: `maxRepayAmount` collapses
  // to 0 and the slider falls back to a cosmetic max, so the generic branches
  // below would mislead ("Enter an amount" / "Amount exceeds debt"). Surface
  // the real reason and the fix. Callers must only pass a genuine 0 here — not
  // a balance that is still loading or failed to load (see Repay/index.tsx).
  if (
    currentDebtAmount !== undefined &&
    userTokenBalance !== undefined &&
    currentDebtAmount > 0 &&
    userTokenBalance === 0
  ) {
    return {
      isDisabled: true,
      buttonText: copy.insufficientBalance,
      errorMessage: copy.zeroBalance(
        symbol,
        formatTokenAmount(currentDebtAmount, displayDecimals),
      ),
      warningMessage: null,
    };
  }

  // Independent of the typed amount: if the user's balance is less than the
  // outstanding debt, surface that up front so a max-repay doesn't silently
  // leave the user with residual debt and no clear next step.
  const balanceShortfall =
    userTokenBalance !== undefined &&
    currentDebtAmount !== undefined &&
    userTokenBalance > 0 &&
    userTokenBalance < currentDebtAmount;

  // `formatTokenAmount` adapts precision per number so dust isn't shown as
  // "0.00" while normal amounts aren't padded with noisy zeros.
  const shortfallMessage = balanceShortfall
    ? copy.shortfall(
        formatTokenAmount(userTokenBalance as number, displayDecimals),
        formatTokenAmount(currentDebtAmount as number, displayDecimals),
        formatTokenAmount(
          (currentDebtAmount as number) - (userTokenBalance as number),
          displayDecimals,
        ),
        tokenUnit,
      )
    : null;

  if (repayAmount === 0) {
    return {
      isDisabled: true,
      buttonText: copy.enterAmount,
      errorMessage: null,
      warningMessage: shortfallMessage,
    };
  }

  if (repayAmount > maxRepayAmount) {
    if (balanceShortfall) {
      return {
        isDisabled: true,
        buttonText: copy.insufficientBalance,
        errorMessage: copy.insufficientForFull(
          formatTokenAmount(userTokenBalance as number, displayDecimals),
          tokenUnit,
        ),
        warningMessage: null,
      };
    }
    return {
      isDisabled: true,
      buttonText: copy.amountExceedsDebt,
      errorMessage: copy.cannotExceedDebt,
      warningMessage: null,
    };
  }

  return {
    isDisabled: false,
    buttonText: copy.action,
    errorMessage: null,
    warningMessage: shortfallMessage,
  };
}
