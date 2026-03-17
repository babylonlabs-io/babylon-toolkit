/**
 * Hook to check if existing vaults need rebalancing.
 *
 * Runs checkRebalanceNeeded from ts-sdk when user has 2+ vaults.
 * Used on position page load to detect when parameter changes
 * have made the current split insufficient.
 */

import { checkRebalanceNeeded } from "@babylonlabs-io/ts-sdk/tbv/integrations/aave";
import { useMemo } from "react";

import {
  EXPECTED_HEALTH_FACTOR_AT_LIQUIDATION,
  VAULT_SPLIT_SAFETY_MARGIN,
} from "../constants";

import { useVaultSplitParams } from "./useVaultSplitParams";

export interface UseRebalanceCheckResult {
  /** Whether the sacrificial vault needs to be increased */
  needsRebalance: boolean;
  /** How much more the sacrificial vault needs in satoshis */
  deficit: bigint;
  /** Current sacrificial vault coverage in satoshis */
  currentCoverage: bigint;
  /** Required sacrificial vault coverage in satoshis */
  targetCoverage: bigint;
  /** Whether split params are still loading */
  isLoading: boolean;
  /** Error from param fetching */
  error: Error | null;
}

const DEFAULT_RESULT: Omit<UseRebalanceCheckResult, "isLoading" | "error"> = {
  needsRebalance: false,
  deficit: 0n,
  currentCoverage: 0n,
  targetCoverage: 0n,
};

/**
 * @param vaultAmounts - Callers should stabilize this array with useMemo
 *   to avoid unnecessary recomputations (arrays are compared by reference).
 */
export function useRebalanceCheck(
  vaultAmounts: bigint[],
): UseRebalanceCheckResult {
  const { params, isLoading, error } = useVaultSplitParams();

  const result = useMemo(() => {
    if (!params || vaultAmounts.length < 2) {
      return DEFAULT_RESULT;
    }

    const { THF, CF, LB } = params;

    return checkRebalanceNeeded({
      vaultAmounts,
      CF,
      LB,
      THF,
      expectedHF: EXPECTED_HEALTH_FACTOR_AT_LIQUIDATION,
      safetyMargin: VAULT_SPLIT_SAFETY_MARGIN,
    });
  }, [params, vaultAmounts]);

  return {
    ...result,
    isLoading,
    error,
  };
}
