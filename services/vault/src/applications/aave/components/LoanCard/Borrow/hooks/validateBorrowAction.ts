/**
 * Borrow action validation
 *
 * Validates whether user can perform the borrow action based on amount and health factor.
 */

import { COPY } from "@/copy";

import {
  formatDisplayAmount,
  formatTokenAmount,
} from "../../../../../../utils/formatting";
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
 * @param maxBorrowAmount - Effective maximum borrowable amount (collateral- and
 *   debt-based, already capped by available reserve liquidity when known)
 * @param tokenDecimals - Native token decimals (e.g., 8 for WBTC, 6 for USDC, 18 for ETH)
 * @param symbol - Token symbol, shown in the error description (e.g. "DAI")
 * @param isPositionDataStale - Whether position data may be outdated
 * @param limitedByLiquidity - Whether `maxBorrowAmount` is bound by the
 *   reserve's available liquidity (vs the user's collateral). Selects the
 *   "exceeds available liquidity" message over the generic "exceeds maximum".
 * @returns Validation result with disabled state, button text, and error message
 */
export function validateBorrowAction(
  borrowAmount: number,
  projectedHealthFactor: number,
  maxBorrowAmount: number,
  tokenDecimals: number,
  symbol: string,
  isPositionDataStale = false,
  limitedByLiquidity = false,
): BorrowValidationResult {
  if (isPositionDataStale) {
    return {
      isDisabled: true,
      buttonText: COPY.loans.borrow.refreshingPosition,
      errorMessage: null,
    };
  }

  if (borrowAmount === 0) {
    return {
      isDisabled: true,
      buttonText: COPY.loans.borrow.enterAmount,
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
      buttonText: COPY.loans.borrow.amountTooSmall,
      errorMessage: COPY.loans.validation.minBorrow(
        formatTokenAmount(minBorrowable, displayDecimals),
      ),
    };
  }

  if (borrowAmount > maxBorrowAmount) {
    const formattedMax = formatDisplayAmount(maxBorrowAmount, displayDecimals);
    return limitedByLiquidity
      ? {
          isDisabled: true,
          buttonText: COPY.loans.borrow.amountExceedsLiquidity,
          errorMessage: COPY.loans.validation.exceedsLiquidity(
            formattedMax,
            symbol,
          ),
        }
      : {
          isDisabled: true,
          buttonText: COPY.loans.borrow.amountExceedsMax,
          errorMessage: COPY.loans.validation.maxBorrow(formattedMax, symbol),
        };
  }

  // Block borrow if health factor would be too low
  if (
    isFinite(projectedHealthFactor) &&
    projectedHealthFactor < MIN_HEALTH_FACTOR_FOR_BORROW
  ) {
    return {
      isDisabled: true,
      buttonText: COPY.loans.borrow.healthFactorTooLow,
      errorMessage: COPY.loans.validation.healthFactorTooLow(
        MIN_HEALTH_FACTOR_FOR_BORROW,
      ),
    };
  }

  return {
    isDisabled: false,
    buttonText: COPY.loans.borrow.action,
    errorMessage: null,
  };
}
