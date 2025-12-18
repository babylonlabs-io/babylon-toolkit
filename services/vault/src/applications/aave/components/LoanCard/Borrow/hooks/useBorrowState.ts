/**
 * Borrow state management hook
 *
 * Manages borrow amount and calculates max borrow based on position data.
 */

import { useMemo, useState } from "react";

export interface UseBorrowStateProps {
  /** Collateral value in USD (from Aave oracle) */
  collateralValueUsd: number;
  /** Current debt in USD (from Aave oracle) */
  currentDebtUsd: number;
}

export interface UseBorrowStateResult {
  borrowAmount: number;
  setBorrowAmount: (amount: number) => void;
  resetBorrowAmount: () => void;
  maxBorrowAmount: number;
}

export function useBorrowState({
  collateralValueUsd,
  currentDebtUsd,
}: UseBorrowStateProps): UseBorrowStateResult {
  const [borrowAmount, setBorrowAmount] = useState(0);

  const maxBorrowAmount = useMemo(() => {
    // Max borrow = collateral value minus existing debt
    // UI validates health factor separately to warn about liquidation risk
    const maxAdditionalBorrow = collateralValueUsd - currentDebtUsd;
    return Math.floor(Math.max(0, maxAdditionalBorrow) * 100) / 100;
  }, [collateralValueUsd, currentDebtUsd]);

  const resetBorrowAmount = () => setBorrowAmount(0);

  return {
    borrowAmount,
    setBorrowAmount,
    resetBorrowAmount,
    maxBorrowAmount,
  };
}
