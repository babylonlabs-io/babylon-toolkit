/**
 * Repay state management hook
 * Handles state and calculations for the repay flow
 */

import { useEffect, useMemo, useState } from "react";

export interface UseRepayStateProps {
  currentLoanAmount: number;
  currentCollateralAmount: number;
  btcPrice: number;
}

export interface UseRepayStateResult {
  // State
  repayAmount: number;
  withdrawCollateralAmount: number;

  // Setters
  setRepayAmount: (amount: number) => void;
  setWithdrawCollateralAmount: (amount: number) => void;

  // Computed values
  withdrawCollateralSteps: Array<{ value: number }>;
  ltv: number;
  remainingCollateral: number;
  remainingLoan: number;
  withdrawCollateralValueUSD: number;
}

export function useRepayState({
  currentLoanAmount,
  currentCollateralAmount,
  btcPrice,
}: UseRepayStateProps): UseRepayStateResult {
  const [repayAmount, setRepayAmount] = useState(0);
  const [withdrawCollateralAmount, setWithdrawCollateralAmount] = useState(0);

  // Reset both sliders when loan amount changes (after refetch from successful repay)
  // This automatically resets after transaction completes
  useEffect(() => {
    setRepayAmount(0);
    setWithdrawCollateralAmount(0);
  }, [currentLoanAmount]);

  // Reset both sliders when collateral amount changes (after refetch from successful withdraw)
  useEffect(() => {
    setRepayAmount(0);
    setWithdrawCollateralAmount(0);
  }, [currentCollateralAmount]);

  // Generate withdraw collateral slider steps (0%, 20%, 40%, 60%, 80%, 100%)
  const withdrawCollateralSteps = useMemo(() => {
    return [
      { value: 0 },
      { value: currentCollateralAmount * 0.2 },
      { value: currentCollateralAmount * 0.4 },
      { value: currentCollateralAmount * 0.6 },
      { value: currentCollateralAmount * 0.8 },
      { value: currentCollateralAmount },
    ];
  }, [currentCollateralAmount]);

  // Calculate remaining values after repay/withdraw
  const remainingCollateral = useMemo(
    () => currentCollateralAmount - withdrawCollateralAmount,
    [currentCollateralAmount, withdrawCollateralAmount],
  );

  const remainingLoan = useMemo(
    () => currentLoanAmount - repayAmount,
    [currentLoanAmount, repayAmount],
  );

  // Calculate withdraw collateral value in USD
  const withdrawCollateralValueUSD = useMemo(
    () => withdrawCollateralAmount * btcPrice,
    [withdrawCollateralAmount, btcPrice],
  );

  // Calculate LTV after repay/withdraw
  // LTV = (remaining loan / remaining collateral value) * 100
  const ltv = useMemo(() => {
    if (remainingCollateral === 0) return 0;
    const remainingCollateralValueUSD = remainingCollateral * btcPrice;
    return (remainingLoan / remainingCollateralValueUSD) * 100;
  }, [remainingCollateral, remainingLoan, btcPrice]);

  return {
    repayAmount,
    withdrawCollateralAmount,
    setRepayAmount,
    setWithdrawCollateralAmount,
    withdrawCollateralSteps,
    ltv,
    remainingCollateral,
    remainingLoan,
    withdrawCollateralValueUSD,
  };
}
