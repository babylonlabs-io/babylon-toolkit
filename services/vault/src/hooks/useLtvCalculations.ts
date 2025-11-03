/**
 * Hook for LTV (Loan-to-Value) calculations
 */

import { useMemo } from "react";

interface UseLtvCalculationsProps {
  borrowData: {
    collateral: number;
    borrow: number;
  };
  repayData: {
    repay: number;
    withdraw: number;
  };
  btcPrice: number;
  currentLoanAmount: number;
  currentCollateralAmount: number;
}

export interface UseLtvCalculationsResult {
  borrowLtv: number;
  repayLtv: number;
}

/**
 * Calculates LTV percentages for borrow and repay operations
 */
export function useLtvCalculations({
  borrowData,
  repayData,
  btcPrice,
  currentLoanAmount,
  currentCollateralAmount,
}: UseLtvCalculationsProps): UseLtvCalculationsResult {
  const borrowLtv = useMemo(() => {
    // Calculate total collateral and total borrowed after the operation
    const totalCollateral = currentCollateralAmount + borrowData.collateral;
    const totalBorrowed = currentLoanAmount + borrowData.borrow;

    if (totalCollateral === 0) return 0;
    return (totalBorrowed / (totalCollateral * btcPrice)) * 100;
  }, [
    borrowData.borrow,
    borrowData.collateral,
    btcPrice,
    currentCollateralAmount,
    currentLoanAmount,
  ]);

  const repayLtv = useMemo(() => {
    const remainingCollateral = currentCollateralAmount - repayData.withdraw;
    if (remainingCollateral === 0) return 0;
    const remainingLoan = currentLoanAmount - repayData.repay;
    return (remainingLoan / (remainingCollateral * btcPrice)) * 100;
  }, [
    currentCollateralAmount,
    repayData.withdraw,
    currentLoanAmount,
    repayData.repay,
    btcPrice,
  ]);

  return {
    borrowLtv,
    repayLtv,
  };
}
