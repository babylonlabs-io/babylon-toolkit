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
 * @param maxRepayAmount - Maximum repay amount
 * @returns Validation result with disabled state, button text, and error message
 */
export function validateRepayAction(
  repayAmount: number,
  maxRepayAmount: number,
): RepayValidationResult {
  if (repayAmount === 0) {
    return {
      isDisabled: true,
      buttonText: "Enter an amount",
      errorMessage: null,
    };
  }

  if (repayAmount > maxRepayAmount) {
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
