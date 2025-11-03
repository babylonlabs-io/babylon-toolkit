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

  const isDisabled =
    borrowAmount === 0 || hasInsufficientLiquidity || hasNoCollateral;

  const buttonText = useMemo(() => {
    if (hasInsufficientLiquidity) {
      return `Insufficient liquidity (${availableLiquidity.toLocaleString()} USDC available)`;
    }
    if (hasNoCollateral && borrowAmount > 0) {
      return "Add collateral to borrow";
    }
    if (borrowAmount === 0) {
      return "Enter borrow amount";
    }
    return "Borrow";
  }, [
    hasInsufficientLiquidity,
    hasNoCollateral,
    borrowAmount,
    availableLiquidity,
  ]);

  return {
    isDisabled,
    buttonText,
  };
}
