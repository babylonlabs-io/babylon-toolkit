/**
 * Borrow UI state management hook
 * Handles UI-specific logic like button states and text
 */

import { useMemo } from "react";

export interface UseBorrowUIProps {
  collateralAmount: number;
  borrowAmount: number;
  currentCollateralAmount: number;
  availableLiquidity: number;
}

export interface UseBorrowUIResult {
  isDisabled: boolean;
  buttonText: string;
}

export function useBorrowUI({
  collateralAmount,
  borrowAmount,
  currentCollateralAmount,
  availableLiquidity,
}: UseBorrowUIProps): UseBorrowUIResult {
  const hasInsufficientLiquidity = borrowAmount > availableLiquidity;
  const hasNoCollateral =
    collateralAmount === 0 && currentCollateralAmount === 0;
  const hasNewCollateral = collateralAmount > 0;

  // Allow either:
  // 1. Adding collateral only (collateralAmount > 0, borrowAmount = 0)
  // 2. Borrowing with collateral (borrowAmount > 0, collateralAmount >= 0 || currentCollateralAmount > 0)
  const isDisabled =
    (borrowAmount === 0 && !hasNewCollateral) || // Must have at least new collateral OR borrow amount
    hasInsufficientLiquidity ||
    (borrowAmount > 0 && hasNoCollateral); // If borrowing, must have collateral

  const buttonText = useMemo(() => {
    if (hasInsufficientLiquidity) {
      return `Insufficient liquidity (${availableLiquidity.toLocaleString()} USDC available)`;
    }
    if (hasNoCollateral && borrowAmount > 0) {
      return "Add collateral to borrow";
    }
    if (borrowAmount === 0 && hasNewCollateral) {
      return "Top Up Collateral";
    }
    if (borrowAmount === 0) {
      return "Enter borrow amount or add collateral";
    }
    return "Borrow";
  }, [
    hasInsufficientLiquidity,
    hasNoCollateral,
    borrowAmount,
    availableLiquidity,
    hasNewCollateral,
  ]);

  return {
    isDisabled,
    buttonText,
  };
}
