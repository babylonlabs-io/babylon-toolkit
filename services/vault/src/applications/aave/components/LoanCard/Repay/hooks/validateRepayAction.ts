/**
 * Repay action validation
 *
 * Validates whether user can perform the repay action based on amount.
 */

export interface RepayValidationResult {
  isDisabled: boolean;
  buttonText: string;
  errorMessage: string | null;
}

/**
 * Validates whether the repay action is allowed.
 *
 * @param repayAmount - Amount user wants to repay
 * @param maxRepayAmount - Maximum repay amount (min of debt and balance)
 * @param currentDebtAmount - Current debt amount (optional, for better error messages)
 * @param userTokenBalance - User's token balance (optional, for better error messages)
 * @returns Validation result with disabled state, button text, and error message
 */
export function validateRepayAction(
  repayAmount: number,
  maxRepayAmount: number,
  currentDebtAmount?: number,
  userTokenBalance?: number,
): RepayValidationResult {
  if (repayAmount === 0) {
    return {
      isDisabled: true,
      buttonText: "Enter an amount",
      errorMessage: null,
    };
  }

  if (repayAmount > maxRepayAmount) {
    // Determine the specific reason for the limit
    if (
      userTokenBalance !== undefined &&
      currentDebtAmount !== undefined &&
      userTokenBalance < currentDebtAmount
    ) {
      return {
        isDisabled: true,
        buttonText: "Insufficient balance",
        errorMessage: `You only have ${userTokenBalance.toFixed(2)} tokens available. You need more tokens to fully repay your debt.`,
      };
    }
    return {
      isDisabled: true,
      buttonText: "Amount exceeds debt",
      errorMessage: "You cannot repay more than your current debt.",
    };
  }

  return {
    isDisabled: false,
    buttonText: "Repay",
    errorMessage: null,
  };
}
