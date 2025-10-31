/**
 * Borrow state management hook
 * Handles state and calculations for the borrow flow
 */

import { useMemo, useState } from "react";

import {
  amountsToSliderSteps,
  calculateSubsetSums,
} from "../../../../../utils/subsetSum";

export interface AvailableVault {
  /** Amount in satoshis (bigint for precision) */
  amountSatoshis: bigint;
  /** Transaction hash (vault ID) */
  txHash: string;
}

export interface UseBorrowStateProps {
  btcPrice: number;
  /** Available vaults with status AVAILABLE (status 2) */
  availableVaults?: AvailableVault[];
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
  maxCollateralFromVaults: number; // Maximum possible collateral from vault combinations
  ltv: number;
  collateralValueUSD: number;
}

export function useBorrowState({
  btcPrice,
  availableVaults = [],
}: UseBorrowStateProps): UseBorrowStateResult {
  const [collateralAmount, setCollateralAmount] = useState(0);
  const [borrowAmount, setBorrowAmount] = useState(0);

  // Calculate maximum collateral from available vaults (sum of all vaults)
  const maxCollateralFromVaults = useMemo(() => {
    if (availableVaults.length === 0) {
      return 0; // No vaults = cannot borrow
    }

    // Sum all vault amounts to get maximum possible collateral
    const totalSatoshis = availableVaults.reduce(
      (sum, vault) => sum + vault.amountSatoshis,
      0n,
    );

    // Convert to BTC
    return Number(totalSatoshis) / 1e8;
  }, [availableVaults]);

  // Generate collateral slider steps based on available vaults
  // If vaults are provided, calculate all possible combinations using satoshis
  // Otherwise, fall back to percentage-based steps
  const collateralSteps = useMemo(() => {
    // If we have available vaults, calculate all possible subset sums in satoshis
    if (availableVaults.length > 0) {
      const vaultAmountsSatoshis = availableVaults.map(
        (vault) => vault.amountSatoshis,
      );
      const possibleSumsSatoshis = calculateSubsetSums(vaultAmountsSatoshis);

      // Convert satoshis to BTC for slider display, include 0 at the start (no collateral)
      return [{ value: 0 }, ...amountsToSliderSteps(possibleSumsSatoshis)];
    }

    // Fallback: No vaults means no collateral options
    return [{ value: 0 }];
  }, [availableVaults]);

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
    maxCollateralFromVaults,
    ltv,
    collateralValueUSD,
  };
}
