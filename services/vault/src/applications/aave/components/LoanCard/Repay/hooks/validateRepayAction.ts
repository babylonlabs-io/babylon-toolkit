/**
 * Repay action validation
 *
 * Validates whether user can perform the repay action based on amount.
 */

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
 * @returns Validation result with disabled state, button text, and error/warning messages
 */
export function validateRepayAction(
  repayAmount: number,
  maxRepayAmount: number,
  currentDebtAmount?: number,
  userTokenBalance?: number,
): RepayValidationResult {
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
    ? `Your balance (${formatTokenAmount(userTokenBalance as number)}) is less than your debt (${formatTokenAmount(currentDebtAmount as number)}). Repaying now will leave ${formatTokenAmount((currentDebtAmount as number) - (userTokenBalance as number))} in debt; acquire more tokens to fully clear it.`
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
        errorMessage: `You only have ${formatTokenAmount(userTokenBalance as number)} tokens available. You need more tokens to fully repay your debt.`,
        warningMessage: null,
      };
    }
    return {
      isDisabled: true,
      buttonText: "Amount exceeds debt",
      errorMessage: "You cannot repay more than your current debt.",
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
