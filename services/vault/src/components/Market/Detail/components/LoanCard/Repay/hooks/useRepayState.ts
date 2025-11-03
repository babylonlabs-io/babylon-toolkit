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
  canWithdrawCollateral: boolean;
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

  // Calculate remaining loan after repayment
  const remainingLoan = useMemo(
    () => currentLoanAmount - repayAmount,
    [currentLoanAmount, repayAmount],
  );

  // User can only withdraw ALL collateral when fully repaying
  const canWithdrawCollateral = useMemo(() => {
    return remainingLoan <= 0;
  }, [remainingLoan]);

  // Auto-reset withdraw amount if user reduces repay amount below full
  useEffect(() => {
    if (!canWithdrawCollateral && withdrawCollateralAmount > 0) {
      setWithdrawCollateralAmount(0);
    }
  }, [canWithdrawCollateral, withdrawCollateralAmount]);

  // Generate withdraw collateral slider steps (only 0 or all)
  const withdrawCollateralSteps = useMemo(() => {
    return [{ value: 0 }, { value: currentCollateralAmount }];
  }, [currentCollateralAmount]);

  // Calculate remaining collateral after withdraw
  const remainingCollateral = useMemo(
    () => currentCollateralAmount - withdrawCollateralAmount,
    [currentCollateralAmount, withdrawCollateralAmount],
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
    canWithdrawCollateral,
    withdrawCollateralSteps,
    ltv,
    remainingCollateral,
    remainingLoan,
    withdrawCollateralValueUSD,
  };
}
