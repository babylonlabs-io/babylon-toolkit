/**
 * Borrow state management hook
 *
 * Manages borrow amount (in token units) and calculates max borrow
 * based on position data, liquidation threshold, and safety margin.
 */

import { useMemo, useState } from "react";

import { calculateMaxBorrowTokens } from "./calculateMaxBorrowTokens";

export interface UseBorrowStateProps {
  /** Collateral value in USD (from Aave oracle) */
  collateralValueUsd: number;
  /** Current debt in USD (from Aave oracle) */
  currentDebtUsd: number;
  /** Liquidation threshold in BPS (e.g., 8000 = 80%) */
  liquidationThresholdBps: number;
  /** Price of the borrow token in USD (null when oracle price is unavailable) */
  tokenPriceUsd: number | null;
  /** Native token decimals (e.g., 8 for WBTC, 6 for USDC, 18 for ETH) */
  tokenDecimals: number;
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
  tokenDecimals,
}: UseBorrowStateProps): UseBorrowStateResult {
  const [borrowAmount, setBorrowAmount] = useState(0);

  const maxBorrowAmount = useMemo(
    () =>
      calculateMaxBorrowTokens({
        collateralValueUsd,
        currentDebtUsd,
        liquidationThresholdBps,
        tokenPriceUsd,
        tokenDecimals,
      }),
    [
      collateralValueUsd,
      currentDebtUsd,
      liquidationThresholdBps,
      tokenPriceUsd,
      tokenDecimals,
    ],
  );

  const resetBorrowAmount = () => setBorrowAmount(0);

  return {
    borrowAmount,
    setBorrowAmount,
    resetBorrowAmount,
    maxBorrowAmount,
  };
}
