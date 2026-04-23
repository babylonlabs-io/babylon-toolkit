/**
 * Borrow action validation
 *
 * Validates whether user can perform the borrow action based on amount and health factor.
 */

import { MIN_HEALTH_FACTOR_FOR_BORROW } from "../../../../constants";

export interface BorrowValidationResult {
  isDisabled: boolean;
  buttonText: string;
  errorMessage: string | null;
}

/**
 * Validates whether the borrow action is allowed.
 *
 * @param borrowAmount - Amount user wants to borrow
 * @param projectedHealthFactor - Health factor after the borrow
 * @param maxBorrowAmount - Maximum borrowable amount based on collateral and debt
 * @param isPositionDataStale - Whether position data may be outdated
 * @returns Validation result with disabled state, button text, and error message
 */
export function validateBorrowAction(
  borrowAmount: number,
  projectedHealthFactor: number,
  maxBorrowAmount: number,
  isPositionDataStale = false,
): BorrowValidationResult {
  if (isPositionDataStale) {
    return {
      isDisabled: true,
      buttonText: "Refreshing position...",
      errorMessage: null,
    };
  }

  if (borrowAmount === 0) {
    return {
      isDisabled: true,
      buttonText: "Enter an amount",
      errorMessage: null,
    };
  }

  if (borrowAmount > maxBorrowAmount) {
    return {
      isDisabled: true,
      buttonText: "Amount exceeds maximum",
      errorMessage: `Maximum borrowable amount is ${maxBorrowAmount.toFixed(2)}`,
    };
  }

  // Block borrow if health factor would be too low
  if (
    isFinite(projectedHealthFactor) &&
    projectedHealthFactor < MIN_HEALTH_FACTOR_FOR_BORROW
  ) {
    return {
      isDisabled: true,
      buttonText: "Health factor too low",
      errorMessage: `Borrowing this amount would put your health factor below ${MIN_HEALTH_FACTOR_FOR_BORROW}, risking liquidation. Reduce the borrow amount.`,
    };
  }

  return {
    isDisabled: false,
    buttonText: "Borrow",
    errorMessage: null,
  };
}
