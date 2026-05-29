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

  // The token's on-chain precision (capped at SAFE_TOFIXED_PRECISION) and the
  // smallest representable amount (one base unit) at that precision.
  const displayDecimals = Math.min(tokenDecimals, SAFE_TOFIXED_PRECISION);
  const minBorrowable = 1 / 10 ** displayDecimals;

  // Reject any sub-precision amount (below one base unit). The submit path
  // sends `parseUnits(borrowAmount.toFixed(displayDecimals))`, which rounds:
  // 0.0000001 USDC rounds DOWN to 0 (contract reverts "Amount cannot be zero")
  // and 0.0000009 rounds UP to 1 base unit (borrows more than entered). Compare
  // against the minimum directly so both cases are blocked, not just round-to-0.
  if (borrowAmount < minBorrowable) {
    return {
      isDisabled: true,
      buttonText: "Amount too small",
      errorMessage: `Minimum borrowable amount is ${formatTokenAmount(minBorrowable, displayDecimals)}`,
    };
  }

  if (borrowAmount > maxBorrowAmount) {
    // Format with the token's native precision so the error text matches what
    // the slider's Max label and calculateMaxBorrowTokens floor expose (the
    // default 6-decimal cap would round a small WBTC max down to "0").
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
