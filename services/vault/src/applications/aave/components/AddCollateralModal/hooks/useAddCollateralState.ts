/**
 * Hook for managing Add Collateral modal state
 *
 * Vault bucket approach where slider steps are based on
 * all possible subset sums of vault amounts.
 */

import { useMemo, useState } from "react";

import {
  amountsToSliderSteps,
  btcToSatoshis,
  calculateSubsetSums,
  findVaultIndicesForAmount,
} from "@/utils/subsetSum";

import {
  calculateHealthFactor,
  calculateTotalVaultAmount,
} from "../../../utils";
import type { VaultData } from "../../Overview/components/VaultsTable";

export interface UseAddCollateralStateProps {
  /** Available vaults that can be added as collateral */
  availableVaults: VaultData[];
  /** Current collateral value in USD */
  currentCollateralUsd: number;
  /** Current debt value in USD */
  currentDebtUsd: number;
  /** Liquidation threshold in basis points (e.g., 8000 bps = 80%) */
  liquidationThresholdBps: number;
  /** Current BTC price in USD */
  btcPrice: number;
}

export interface SliderStep {
  value: number;
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
  /** Collateral value in USD */
  collateralValueUsd: number;
  /** Projected health factor after adding collateral */
  projectedHealthFactor: number | null;
  /** Slider steps based on vault bucket combinations */
  collateralSteps: SliderStep[];
}

export function useAddCollateralState({
  availableVaults,
  currentCollateralUsd,
  currentDebtUsd,
  liquidationThresholdBps,
  btcPrice,
}: UseAddCollateralStateProps): UseAddCollateralStateResult {
  const [collateralAmount, setCollateralAmount] = useState(0);

  // Convert vault amounts to satoshis for precise calculations
  const vaultAmountsSatoshis = useMemo(() => {
    return availableVaults.map((vault) => btcToSatoshis(vault.amount));
  }, [availableVaults]);

  // Calculate maximum collateral from available vaults
  const maxCollateralAmount = useMemo(() => {
    return calculateTotalVaultAmount(availableVaults);
  }, [availableVaults]);

  const collateralSteps = useMemo(() => {
    if (availableVaults.length === 0) {
      return [{ value: 0 }];
    }

    const possibleSumsSatoshis = calculateSubsetSums(vaultAmountsSatoshis);
    return [{ value: 0 }, ...amountsToSliderSteps(possibleSumsSatoshis)];
  }, [availableVaults.length, vaultAmountsSatoshis]);

  // Select vaults based on the collateral amount using exact matching
  const selectedVaultIds = useMemo(() => {
    if (collateralAmount <= 0) return [];

    const targetSatoshis = btcToSatoshis(collateralAmount);
    const vaultIndices = findVaultIndicesForAmount(
      vaultAmountsSatoshis,
      targetSatoshis,
    );

    if (vaultIndices === null) return [];

    return vaultIndices.map((index) => availableVaults[index].id);
  }, [availableVaults, collateralAmount, vaultAmountsSatoshis]);

  // Calculate collateral value in USD
  const collateralValueUsd = useMemo(() => {
    return collateralAmount * btcPrice;
  }, [collateralAmount, btcPrice]);

  // Calculate projected health factor
  const projectedHealthFactor = useMemo(() => {
    if (currentDebtUsd <= 0) return null;

    const projectedCollateralUsd =
      currentCollateralUsd + collateralAmount * btcPrice;
    const healthFactor = calculateHealthFactor(
      projectedCollateralUsd,
      currentDebtUsd,
      liquidationThresholdBps,
    );

    return healthFactor > 0 ? healthFactor : null;
  }, [
    currentCollateralUsd,
    collateralAmount,
    btcPrice,
    currentDebtUsd,
    liquidationThresholdBps,
  ]);

  return {
    collateralAmount,
    setCollateralAmount,
    maxCollateralAmount,
    selectedVaultIds,
    collateralValueUsd,
    projectedHealthFactor,
    collateralSteps,
  };
}
