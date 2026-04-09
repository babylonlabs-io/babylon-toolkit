/**
 * Borrow state management hook
 *
 * Manages borrow amount (in token units) and calculates max borrow
 * based on position data, liquidation threshold, and safety margin.
 */

import { useMemo, useState } from "react";

import { BPS_SCALE, MIN_HEALTH_FACTOR_FOR_BORROW } from "../../../../constants";

export interface UseBorrowStateProps {
  /** Collateral value in USD (from Aave oracle) */
  collateralValueUsd: number;
  /** Current debt in USD (from Aave oracle) */
  currentDebtUsd: number;
  /** Liquidation threshold in BPS (e.g., 8000 = 80%) */
  liquidationThresholdBps: number;
  /** Price of the borrow token in USD */
  tokenPriceUsd: number;
}

export interface UseBorrowStateResult {
  /** Borrow amount in token units */
  borrowAmount: number;
  setBorrowAmount: (amount: number) => void;
  resetBorrowAmount: () => void;
  /** Max borrowable amount in token units */
  maxBorrowAmount: number;
}

export function useBorrowState({
  collateralValueUsd,
  currentDebtUsd,
  liquidationThresholdBps,
  tokenPriceUsd,
}: UseBorrowStateProps): UseBorrowStateResult {
  const [borrowAmount, setBorrowAmount] = useState(0);

  const maxBorrowAmount = useMemo(() => {
    // Max borrow in USD that keeps health factor >= MIN_HEALTH_FACTOR_FOR_BORROW:
    //   HF = (collateral * LT) / totalDebt >= MIN_HF
    //   totalDebt <= (collateral * LT) / MIN_HF
    //   maxAdditionalDebtUsd = (collateral * LT) / MIN_HF - currentDebt
    const maxAdditionalBorrowUsd =
      (collateralValueUsd * liquidationThresholdBps) /
        BPS_SCALE /
        MIN_HEALTH_FACTOR_FOR_BORROW -
      currentDebtUsd;

    // Convert USD cap to token units
    const maxBorrowTokens = maxAdditionalBorrowUsd / tokenPriceUsd;
    return Math.floor(Math.max(0, maxBorrowTokens) * 100) / 100;
  }, [
    collateralValueUsd,
    currentDebtUsd,
    liquidationThresholdBps,
    tokenPriceUsd,
  ]);

  const resetBorrowAmount = () => setBorrowAmount(0);

  return {
    borrowAmount,
    setBorrowAmount,
    resetBorrowAmount,
    maxBorrowAmount,
  };
}
