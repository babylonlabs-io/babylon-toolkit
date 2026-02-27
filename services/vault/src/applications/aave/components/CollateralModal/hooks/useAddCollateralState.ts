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

import type { VaultData } from "../../../types";
import {
  calculateHealthFactor,
  calculateTotalVaultAmount,
} from "../../../utils";

export interface UseAddCollateralStateProps {
  /** Available vaults that can be added as collateral */
  availableVaults: VaultData[];
  /** Current collateral value in USD */
  currentCollateralUsd: number;
  /** Current debt value in USD */
  currentDebtUsd: number;
  /** Liquidation threshold in basis points (e.g., 8000 bps = 80%), undefined if not loaded */
  liquidationThresholdBps: number | undefined;
  /** Current BTC price in USD (null/undefined if not loaded) */
  btcPrice: number | null | undefined;
  /** Current health factor (null if no debt) */
  currentHealthFactor: number | null;
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
  /** Current health factor value for UI (Infinity when no debt) */
  currentHealthFactorValue: number;
  /** Projected health factor value after adding collateral (Infinity when no debt) */
  projectedHealthFactorValue: number;
  /** Slider steps based on vault bucket combinations */
  collateralSteps: SliderStep[];
}

export function useAddCollateralState({
  availableVaults,
  currentCollateralUsd,
  currentDebtUsd,
  liquidationThresholdBps,
  btcPrice,
  currentHealthFactor,
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

  // Calculate collateral value in USD (0 if price not loaded)
  const collateralValueUsd = useMemo(() => {
    if (btcPrice == null) return 0;
    return collateralAmount * btcPrice;
  }, [collateralAmount, btcPrice]);

  // Current health factor value (Infinity when no debt = infinitely healthy)
  const currentHealthFactorValue = currentHealthFactor ?? Infinity;

  // Calculate projected health factor value
  const projectedHealthFactorValue = useMemo(() => {
    // No debt = infinitely healthy
    if (currentDebtUsd <= 0) return Infinity;

    // No additional collateral = current value
    if (collateralAmount === 0) return currentHealthFactorValue;

    // Config or price not loaded yet = show current value
    if (liquidationThresholdBps === undefined || btcPrice == null) {
      return currentHealthFactorValue;
    }

    const projectedCollateralUsd =
      currentCollateralUsd + collateralAmount * btcPrice;
    const healthFactor = calculateHealthFactor(
      projectedCollateralUsd,
      currentDebtUsd,
      liquidationThresholdBps,
    );

    return healthFactor > 0 ? healthFactor : Infinity;
  }, [
    currentCollateralUsd,
    collateralAmount,
    btcPrice,
    currentDebtUsd,
    liquidationThresholdBps,
    currentHealthFactorValue,
  ]);

  return {
    collateralAmount,
    setCollateralAmount,
    maxCollateralAmount,
    selectedVaultIds,
    collateralValueUsd,
    currentHealthFactorValue,
    projectedHealthFactorValue,
    collateralSteps,
  };
}
