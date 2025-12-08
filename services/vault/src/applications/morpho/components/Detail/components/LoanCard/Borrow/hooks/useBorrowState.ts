/**
 * Borrow state management hook
 * Handles state and calculations for the borrow flow
 */

import { useEffect, useMemo, useState } from "react";

import {
  amountsToSliderSteps,
  calculateSubsetSums,
} from "../../../../../../../../utils/subsetSum";
import type { BorrowableVault } from "../../../../hooks/useVaultsForBorrowing";

export interface UseBorrowStateProps {
  btcPrice: number;
  liquidationLtv: number;
  /** Vaults available for use as collateral in borrowing */
  borrowableVaults?: BorrowableVault[];
  /** Current collateral amount in position (BTC) */
  currentCollateralAmount?: number;
  /** Current loan amount in position (USDC) */
  currentLoanAmount?: number;
}

export interface UseBorrowStateResult {
  // State
  collateralAmount: number;
  borrowAmount: number;

  // Setters
  setCollateralAmount: (amount: number) => void;
  setBorrowAmount: (amount: number) => void;
  resetAmounts: () => void;

  // Computed values
  collateralSteps: Array<{ value: number }>;
  maxCollateralFromVaults: number; // Maximum possible collateral from vault combinations
  maxBorrowAmount: number; // Maximum borrow based on collateral * LLTV
  ltv: number;
  collateralValueUSD: number;
}

export function useBorrowState({
  btcPrice,
  liquidationLtv,
  borrowableVaults = [],
  currentCollateralAmount = 0,
  currentLoanAmount = 0,
}: UseBorrowStateProps): UseBorrowStateResult {
  const [collateralAmount, setCollateralAmount] = useState(0);
  const [borrowAmount, setBorrowAmount] = useState(0);

  // Reset both amounts to 0
  const resetAmounts = () => {
    setCollateralAmount(0);
    setBorrowAmount(0);
  };

  // Reset borrow amount when collateral changes
  // This prevents invalid states where borrow amount exceeds new max after reducing collateral
  useEffect(() => {
    setBorrowAmount(0);
  }, [collateralAmount]);

  // Reset both sliders when available vaults change (after refetch from successful borrow with new collateral)
  useEffect(() => {
    setCollateralAmount(0);
    setBorrowAmount(0);
  }, [borrowableVaults]);

  // Reset both sliders when current loan amount changes (after refetch from successful borrow)
  // This handles the case where user borrows from existing collateral without adding new vaults
  useEffect(() => {
    setCollateralAmount(0);
    setBorrowAmount(0);
  }, [currentLoanAmount]);

  // Calculate maximum collateral from available vaults (sum of all vaults)
  const maxCollateralFromVaults = useMemo(() => {
    if (borrowableVaults.length === 0) {
      return 0; // No vaults = cannot borrow
    }

    // Sum all vault amounts to get maximum possible collateral
    const totalSatoshis = borrowableVaults.reduce(
      (sum, vault) => sum + vault.amountSatoshis,
      0n,
    );

    // Convert to BTC
    return Number(totalSatoshis) / 1e8;
  }, [borrowableVaults]);

  // Generate collateral slider steps based on available vaults
  // If vaults are provided, calculate all possible combinations using satoshis
  // Otherwise, fall back to percentage-based steps
  const collateralSteps = useMemo(() => {
    // If we have available vaults, calculate all possible subset sums in satoshis
    if (borrowableVaults.length > 0) {
      const vaultAmountsSatoshis = borrowableVaults.map(
        (vault) => vault.amountSatoshis,
      );
      const possibleSumsSatoshis = calculateSubsetSums(vaultAmountsSatoshis);

      // Convert satoshis to BTC for slider display, include 0 at the start (no collateral)
      return [{ value: 0 }, ...amountsToSliderSteps(possibleSumsSatoshis)];
    }

    // Fallback: No vaults means no collateral options
    return [{ value: 0 }];
  }, [borrowableVaults]);

  // Calculate collateral value in USD (only new collateral for display)
  const collateralValueUSD = useMemo(
    () => collateralAmount * btcPrice,
    [collateralAmount, btcPrice],
  );

  // Calculate LTV (Loan-to-Value ratio)
  // LTV = (total borrowed / total collateral value) * 100
  const ltv = useMemo(() => {
    const totalCollateral = currentCollateralAmount + collateralAmount;
    const totalBorrowed = currentLoanAmount + borrowAmount;

    if (totalCollateral === 0) return 0;
    return (totalBorrowed / (totalCollateral * btcPrice)) * 100;
  }, [
    collateralAmount,
    currentCollateralAmount,
    borrowAmount,
    currentLoanAmount,
    btcPrice,
  ]);

  // Calculate maximum borrow amount considering both new and existing collateral
  // This updates dynamically as user adjusts collateral slider
  const maxBorrowAmount = useMemo(() => {
    // Total collateral = existing position collateral + new collateral from slider
    const totalCollateral = currentCollateralAmount + collateralAmount;

    // Max total borrow based on all collateral
    const maxTotalBorrow = totalCollateral * btcPrice * (liquidationLtv / 100);

    // Max ADDITIONAL borrow = max total - what's already borrowed
    const maxAdditionalBorrow = maxTotalBorrow - currentLoanAmount;

    // Round to 2 decimal places (cents) and ensure non-negative
    const result = Math.max(0, Math.floor(maxAdditionalBorrow * 100) / 100);

    return result;
  }, [
    collateralAmount,
    currentCollateralAmount,
    currentLoanAmount,
    btcPrice,
    liquidationLtv,
  ]);

  return {
    collateralAmount,
    borrowAmount,
    setCollateralAmount,
    setBorrowAmount,
    resetAmounts,
    collateralSteps,
    maxCollateralFromVaults,
    maxBorrowAmount,
    ltv,
    collateralValueUSD,
  };
}
