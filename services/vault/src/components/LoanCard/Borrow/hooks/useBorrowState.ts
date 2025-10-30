/**
 * Borrow state management hook
 * Handles state and calculations for the borrow flow
 */

import { useMemo, useState } from "react";

export interface UseBorrowStateProps {
  maxCollateral: number;
  btcPrice: number;
}

export interface UseBorrowStateResult {
  // State
  collateralAmount: number;
  borrowAmount: number;

  // Setters
  setCollateralAmount: (amount: number) => void;
  setBorrowAmount: (amount: number) => void;

  // Computed values
  collateralSteps: Array<{ value: number }>;
  ltv: number;
  collateralValueUSD: number;
}

export function useBorrowState({
  maxCollateral,
  btcPrice,
}: UseBorrowStateProps): UseBorrowStateResult {
  const [collateralAmount, setCollateralAmount] = useState(0);
  const [borrowAmount, setBorrowAmount] = useState(0);

  // Generate collateral slider steps (0%, 20%, 40%, 60%, 80%, 100%)
  const collateralSteps = useMemo(() => {
    return [
      { value: 0 },
      { value: maxCollateral * 0.2 },
      { value: maxCollateral * 0.4 },
      { value: maxCollateral * 0.6 },
      { value: maxCollateral * 0.8 },
      { value: maxCollateral },
    ];
  }, [maxCollateral]);

  // Calculate collateral value in USD
  const collateralValueUSD = useMemo(
    () => collateralAmount * btcPrice,
    [collateralAmount, btcPrice],
  );

  // Calculate LTV (Loan-to-Value ratio)
  // LTV = (borrowed amount / collateral value) * 100
  const ltv = useMemo(() => {
    if (collateralAmount === 0) return 0;
    return (borrowAmount / collateralValueUSD) * 100;
  }, [collateralAmount, borrowAmount, collateralValueUSD]);

  return {
    collateralAmount,
    borrowAmount,
    setCollateralAmount,
    setBorrowAmount,
    collateralSteps,
    ltv,
    collateralValueUSD,
  };
}
