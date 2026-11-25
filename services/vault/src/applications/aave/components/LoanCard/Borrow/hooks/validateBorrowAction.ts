/**
 * Borrow action validation
 *
 * Validates whether user can perform the borrow action based on amount and health factor.
 */

import { truncateDecimals } from "@babylonlabs-io/core-ui";

import { COPY } from "@/copy";

import {
  formatDisplayAmount,
  formatTokenAmount,
} from "../../../../../../utils/formatting";
import {
  HEALTH_FACTOR_LIQUIDATION_THRESHOLD,
  MIN_BORROWABLE_USD,
  MIN_HEALTH_FACTOR_FOR_BORROW,
  SAFE_TOFIXED_PRECISION,
} from "../../../../constants";

/**
 * What bounds the borrow max: the user's collateral, the hub's available
 * liquidity, or our spoke's draw cap on that hub (its borrow limit).
 */
export type BorrowLimit = "collateral" | "liquidity" | "borrowLimit";

/**
 * The effective borrow max and what bounds it. Each cap is in token units, or
 * `Infinity` when its read is loading or failed.
 *
 * The max is rounded down to the token's precision, capped at
 * SAFE_TOFIXED_PRECISION, so Max and the top of the slider never put more
 * digits in the amount box than typing allows.
 *
 * @param collateralMax - What the user's collateral allows
 * @param liquidityCap - What the hub's liquidity allows
 * @param borrowLimitCap - What our spoke's draw cap on the hub still allows
 * @param tokenDecimals - Native token decimals (e.g., 8 for WBTC, 6 for USDC)
 */
export function getBorrowLimit(
  collateralMax: number,
  liquidityCap: number,
  borrowLimitCap: number,
  tokenDecimals: number,
): { max: number; limitedBy: BorrowLimit } {
  const cappedMax = Math.min(collateralMax, liquidityCap, borrowLimitCap);
  const max = truncateDecimals(
    cappedMax,
    Math.min(tokenDecimals, SAFE_TOFIXED_PRECISION),
  );
  if (cappedMax >= collateralMax) return { max, limitedBy: "collateral" };
  // The Hub checks the draw cap before liquidity, so the cap wins a tie.
  return {
    max,
    limitedBy: borrowLimitCap <= liquidityCap ? "borrowLimit" : "liquidity",
  };
}

/**
 * Whether Safe mode leaves less than MIN_BORROWABLE_USD to borrow while Safe
 * mode off still leaves at least that much, after the same caps.
 * MIN_BORROWABLE_USD is also the threshold the dashboard uses to enable Borrow.
 *
 * @param safeMode - Whether Safe mode is on
 * @param maxBorrowAmount - What the user's collateral allows with Safe mode on
 * @param safeModeOffMaxBorrowAmount - What the user's collateral allows with Safe mode off
 * @param liquidityCap - What the hub's liquidity allows, `Infinity` when unknown
 * @param borrowLimitCap - What our spoke's draw cap on the hub allows, `Infinity` when unknown
 * @param tokenDecimals - Native token decimals (e.g., 8 for WBTC, 6 for USDC)
 * @param tokenPriceUsd - Borrow token price, null when it is not ready
 */
export function hasReachedSafeModeLimit({
  safeMode,
  maxBorrowAmount,
  safeModeOffMaxBorrowAmount,
  liquidityCap,
  borrowLimitCap,
  tokenDecimals,
  tokenPriceUsd,
}: {
  safeMode: boolean;
  maxBorrowAmount: number;
  safeModeOffMaxBorrowAmount: number;
  liquidityCap: number;
  borrowLimitCap: number;
  tokenDecimals: number;
  tokenPriceUsd: number | null;
}): boolean {
  if (!safeMode || tokenPriceUsd == null) return false;
  const cappedUsd = (collateralMax: number) =>
    getBorrowLimit(collateralMax, liquidityCap, borrowLimitCap, tokenDecimals)
      .max * tokenPriceUsd;
  return (
    cappedUsd(maxBorrowAmount) < MIN_BORROWABLE_USD &&
    cappedUsd(safeModeOffMaxBorrowAmount) >= MIN_BORROWABLE_USD
  );
}

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
 *   debt-based, already capped by available liquidity and the hub's borrow
 *   limit when known)
 * @param tokenDecimals - Native token decimals (e.g., 8 for WBTC, 6 for USDC, 18 for ETH)
 * @param symbol - Token symbol, shown in the error description (e.g. "DAI")
 * @param hubLabel - Hub the reserve belongs to, named beside the symbol: the
 *   same token on another hub is a different market with a different limit
 * @param isPositionDataStale - Whether position data may be outdated
 * @param limitedBy - What bounds `maxBorrowAmount`. Selects the liquidity or
 *   borrow-limit message over the generic "exceeds maximum".
 * @param safeMode - Whether Safe mode is on. On, the projected health factor
 *   must stay at or above MIN_HEALTH_FACTOR_FOR_BORROW; off, above the
 *   liquidation threshold.
 * @returns Validation result with disabled state, button text, and error message
 */
export function validateBorrowAction(
  borrowAmount: number,
  projectedHealthFactor: number,
  maxBorrowAmount: number,
  tokenDecimals: number,
  symbol: string,
  hubLabel: string,
  isPositionDataStale = false,
  limitedBy: BorrowLimit = "collateral",
  safeMode = true,
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
    if (limitedBy === "borrowLimit") {
      return {
        isDisabled: true,
        buttonText: COPY.loans.borrow.amountExceedsBorrowLimit,
        errorMessage:
          maxBorrowAmount > 0
            ? COPY.loans.validation.exceedsBorrowLimit(
                formattedMax,
                symbol,
                hubLabel,
              )
            : COPY.loans.validation.borrowLimitReached(symbol, hubLabel),
      };
    }
    return limitedBy === "liquidity"
      ? {
          isDisabled: true,
          buttonText: COPY.loans.borrow.amountExceedsLiquidity,
          errorMessage: COPY.loans.validation.exceedsLiquidity(
            formattedMax,
            symbol,
            hubLabel,
          ),
        }
      : {
          isDisabled: true,
          buttonText: COPY.loans.borrow.amountExceedsMax,
          errorMessage: COPY.loans.validation.maxBorrow(
            formattedMax,
            symbol,
            hubLabel,
          ),
        };
  }

  if (
    safeMode
      ? projectedHealthFactor < MIN_HEALTH_FACTOR_FOR_BORROW
      : projectedHealthFactor <= HEALTH_FACTOR_LIQUIDATION_THRESHOLD
  ) {
    return {
      isDisabled: true,
      buttonText: COPY.loans.borrow.healthFactorTooLow,
      errorMessage: safeMode
        ? COPY.loans.validation.healthFactorTooLow(MIN_HEALTH_FACTOR_FOR_BORROW)
        : COPY.loans.validation.liquidationLimit,
    };
  }

  return {
    isDisabled: false,
    buttonText: COPY.loans.borrow.action,
    errorMessage: null,
  };
}
