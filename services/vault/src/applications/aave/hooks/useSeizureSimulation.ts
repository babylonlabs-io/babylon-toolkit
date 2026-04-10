/**
 * Hook for simulating prefix seizure on current vault ordering.
 *
 * Combines vault order from indexer + vault amounts + risk params to show
 * which vaults would be seized during liquidation at the expected health factor.
 */

import {
  computeTargetSeizureSats,
  simulatePrefixSeizure,
  type OrderedVault,
  type PrefixSeizureResult,
} from "@babylonlabs-io/ts-sdk/tbv/integrations/aave";
import { useMemo } from "react";
import type { Address, Hex } from "viem";

import { EXPECTED_HEALTH_FACTOR_AT_LIQUIDATION } from "../constants";

import { useVaultOrder } from "./useVaultOrder";
import { useVaultSplitParams } from "./useVaultSplitParams";

export interface UseSeizureSimulationResult {
  /** Simulation result, or null while loading / no data */
  simulation: PrefixSeizureResult | null;
  /** Target seizure amount in satoshis */
  targetSeizureSats: bigint;
  /** Ordered vaults used for the simulation */
  orderedVaults: OrderedVault[];
  /** Whether params or vault order are still loading */
  isLoading: boolean;
  /** Error from param or vault order fetching */
  error: Error | null;
}

/**
 * Map from **lowercase hex** vault ID to amount in satoshis.
 * Keys MUST be lowercased before insertion — lookups use lowercase IDs.
 */
export type VaultAmountMap = ReadonlyMap<Hex, bigint>;

/**
 * Simulate prefix seizure for the user's current vault ordering.
 *
 * Fetches vault order from the indexer and combines it with
 * vault amounts and risk parameters to simulate which vaults would be
 * seized during liquidation.
 *
 * @param userAddress - User's Ethereum address (undefined if not connected)
 * @param vaultAmounts - Map of vault ID → amount in satoshis
 */
export function useSeizureSimulation(
  userAddress: Address | undefined,
  vaultAmounts: VaultAmountMap,
): UseSeizureSimulationResult {
  const {
    vaultIds,
    isLoading: orderLoading,
    error: orderError,
  } = useVaultOrder(userAddress);
  const {
    params,
    isLoading: paramsLoading,
    error: paramsError,
  } = useVaultSplitParams(userAddress);

  const isLoading = orderLoading || paramsLoading;
  const error = orderError ?? paramsError;

  const result = useMemo(() => {
    if (!vaultIds || !params || vaultIds.length === 0) {
      return {
        simulation: null,
        targetSeizureSats: 0n,
        orderedVaults: [] as OrderedVault[],
      };
    }

    // Normalize map keys to lowercase so checksummed caller keys still match
    const normalizedAmounts = new Map<Hex, bigint>();
    for (const [key, value] of vaultAmounts) {
      normalizedAmounts.set(key.toLowerCase() as Hex, value);
    }

    // Build ordered vault list by matching indexer order with amounts
    const orderedVaults: OrderedVault[] = [];
    for (const id of vaultIds) {
      const normalizedId = id.toLowerCase() as Hex;
      const amountSats = normalizedAmounts.get(normalizedId);
      if (amountSats === undefined) {
        // Vault order is known but amounts are incomplete — defer simulation
        return { simulation: null, targetSeizureSats: 0n, orderedVaults: [] };
      }
      orderedVaults.push({ id: normalizedId, amountSats });
    }

    if (orderedVaults.length === 0) {
      return {
        simulation: null,
        targetSeizureSats: 0n,
        orderedVaults: [],
      };
    }

    const { THF, CF, LB } = params;

    const totalCollateralSats = orderedVaults.reduce(
      (sum, v) => sum + v.amountSats,
      0n,
    );

    const targetSeizureSats = computeTargetSeizureSats({
      totalCollateralSats,
      CF,
      LB,
      THF,
      expectedHF: EXPECTED_HEALTH_FACTOR_AT_LIQUIDATION,
    });

    if (targetSeizureSats <= 0n) {
      return { simulation: null, targetSeizureSats: 0n, orderedVaults };
    }

    const simulation = simulatePrefixSeizure({
      orderedVaults,
      targetSeizureSats,
    });

    return { simulation, targetSeizureSats, orderedVaults };
  }, [vaultIds, params, vaultAmounts]);

  return {
    ...result,
    isLoading,
    error,
  };
}
