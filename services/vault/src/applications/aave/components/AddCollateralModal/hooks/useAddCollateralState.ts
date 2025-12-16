/**
 * Hook for managing Add Collateral modal state
 *
 * Handles slider state, vault selection, and health factor projection.
 */

import { useMemo, useState } from "react";

import type { VaultData } from "../../Overview/components/VaultsTable";

export interface UseAddCollateralStateProps {
  /** Available vaults that can be added as collateral */
  availableVaults: VaultData[];
  /** Current collateral amount in BTC */
  currentCollateralBtc: number;
  /** Current debt value in USD */
  currentDebtUsd: number;
  /** Liquidation LTV percentage (e.g., 80 for 80%) */
  liquidationLtv: number;
  /** Current BTC price in USD */
  btcPrice: number;
}

export interface UseAddCollateralStateResult {
  /** Selected collateral amount in BTC */
  collateralAmount: number;
  /** Set the collateral amount */
  setCollateralAmount: (amount: number) => void;
  /** Maximum collateral amount (sum of available vaults) */
  maxCollateralAmount: number;
  /** IDs of vaults selected for collateral */
  selectedVaultIds: string[];
  /** Projected health factor after adding collateral */
  projectedHealthFactor: number | null;
  /** Collateral value in USD */
  collateralValueUsd: number;
}

/**
 * Select vaults to match the target amount using a greedy algorithm.
 * Sorts vaults by amount descending and picks until target is met.
 */
function selectVaultsForAmount(
  vaults: VaultData[],
  targetAmount: number,
): { vaultIds: string[]; actualAmount: number } {
  if (targetAmount <= 0) {
    return { vaultIds: [], actualAmount: 0 };
  }

  // Sort vaults by amount descending for greedy selection
  const sortedVaults = [...vaults].sort((a, b) => b.amount - a.amount);

  const selectedIds: string[] = [];
  let selectedAmount = 0;

  for (const vault of sortedVaults) {
    if (selectedAmount >= targetAmount) break;
    selectedIds.push(vault.id);
    selectedAmount += vault.amount;
  }

  return { vaultIds: selectedIds, actualAmount: selectedAmount };
}

export function useAddCollateralState({
  availableVaults,
  currentCollateralBtc,
  currentDebtUsd,
  liquidationLtv,
  btcPrice,
}: UseAddCollateralStateProps): UseAddCollateralStateResult {
  const [collateralAmount, setCollateralAmount] = useState(0);

  // Calculate maximum collateral from available vaults
  const maxCollateralAmount = useMemo(() => {
    return availableVaults.reduce((sum, vault) => sum + vault.amount, 0);
  }, [availableVaults]);

  // Select vaults based on the collateral amount
  const { vaultIds: selectedVaultIds, actualAmount } = useMemo(() => {
    return selectVaultsForAmount(availableVaults, collateralAmount);
  }, [availableVaults, collateralAmount]);

  // Calculate collateral value in USD
  const collateralValueUsd = useMemo(() => {
    return collateralAmount * btcPrice;
  }, [collateralAmount, btcPrice]);

  // Calculate projected health factor
  const projectedHealthFactor = useMemo(() => {
    // If no debt, health factor is null (infinite/healthy)
    if (currentDebtUsd <= 0) {
      return null;
    }

    // Calculate projected total collateral value
    const projectedCollateralBtc = currentCollateralBtc + actualAmount;
    const projectedCollateralUsd = projectedCollateralBtc * btcPrice;

    // Health factor = (collateralValue * liquidationLTV) / debtValue
    const healthFactor =
      (projectedCollateralUsd * (liquidationLtv / 100)) / currentDebtUsd;

    return healthFactor;
  }, [
    currentCollateralBtc,
    actualAmount,
    btcPrice,
    currentDebtUsd,
    liquidationLtv,
  ]);

  return {
    collateralAmount,
    setCollateralAmount,
    maxCollateralAmount,
    selectedVaultIds,
    projectedHealthFactor,
    collateralValueUsd,
  };
}
