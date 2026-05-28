/**
 * Borrow action validation
 *
 * Validates whether user can perform the borrow action based on amount and health factor.
 */

import { formatTokenAmount } from "../../../../../../utils/formatting";
import {
  MIN_HEALTH_FACTOR_FOR_BORROW,
  SAFE_TOFIXED_PRECISION,
} from "../../../../constants";

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
 * @param tokenDecimals - Native token decimals (e.g., 8 for WBTC, 6 for USDC, 18 for ETH)
 * @param isPositionDataStale - Whether position data may be outdated
 * @returns Validation result with disabled state, button text, and error message
 */
export function validateBorrowAction(
  borrowAmount: number,
  projectedHealthFactor: number,
  maxBorrowAmount: number,
  tokenDecimals: number,
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
    // Format with the token's native precision (capped at SAFE_TOFIXED_PRECISION)
    // so the error text matches what the slider's Max label and the underlying
    // calculateMaxBorrowTokens floor expose. Default 6-decimal cap in
    // formatTokenAmount would round small WBTC maxes (e.g. 0.0000099) down
    // to "0" in the message even though the value is non-zero.
    const displayDecimals = Math.min(tokenDecimals, SAFE_TOFIXED_PRECISION);
    return {
      isDisabled: true,
      buttonText: "Amount exceeds maximum",
      errorMessage: `Maximum borrowable amount is ${formatTokenAmount(maxBorrowAmount, displayDecimals)}`,
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
