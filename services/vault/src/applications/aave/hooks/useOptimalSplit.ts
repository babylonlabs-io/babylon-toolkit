/**
 * Hook for computing the optimal vault split for a given deposit amount.
 *
 * Combines on-chain risk parameters (from useVaultSplitParams) with
 * SDK split computation to determine sacrificial and protected vault sizes.
 */

import {
  computeMinDepositForSplit,
  computeOptimalSplit,
} from "@babylonlabs-io/ts-sdk/tbv/integrations/aave";
import { useMemo } from "react";

import { useProtocolParamsContext } from "@/context/ProtocolParamsContext";

import {
  EXPECTED_HEALTH_FACTOR_AT_LIQUIDATION,
  VAULT_SPLIT_SAFETY_MARGIN,
} from "../constants";

import { useVaultSplitParams } from "./useVaultSplitParams";

export interface UseOptimalSplitResult {
  /** Sacrificial vault amount in satoshis (index 0, seized first) */
  sacrificialVault: bigint;
  /** Protected vault amount in satoshis (index 1, survives liquidation) */
  protectedVault: bigint;
  /** Fraction of collateral that would be seized (0-1) */
  seizedFraction: number;
  /** Whether the deposit is large enough for a 2-vault split */
  canSplit: boolean;
  /** Minimum deposit required for a split, in satoshis */
  minDepositForSplit: bigint;
  /** Whether split params are still loading */
  isLoading: boolean;
  /** Error from param fetching */
  error: Error | null;
}

const EMPTY_RESULT: Omit<UseOptimalSplitResult, "isLoading" | "error"> = {
  sacrificialVault: 0n,
  protectedVault: 0n,
  seizedFraction: 0,
  canSplit: false,
  minDepositForSplit: 0n,
};

export function useOptimalSplit(
  totalBtc: bigint,
  connectedAddress?: string,
): UseOptimalSplitResult {
  const { params, isLoading, error } = useVaultSplitParams(connectedAddress);
  const { minDeposit } = useProtocolParamsContext();

  const result = useMemo(() => {
    if (!params || totalBtc <= 0n) {
      return EMPTY_RESULT;
    }

    const { THF, CF, LB } = params;

    const split = computeOptimalSplit({
      totalBtc,
      CF,
      LB,
      THF,
      expectedHF: EXPECTED_HEALTH_FACTOR_AT_LIQUIDATION,
      safetyMargin: VAULT_SPLIT_SAFETY_MARGIN,
    });

    const minDepositForSplit = computeMinDepositForSplit({
      minPegin: minDeposit,
      seizedFraction: split.seizedFraction,
      safetyMargin: VAULT_SPLIT_SAFETY_MARGIN,
    });

    const canSplit = minDepositForSplit > 0n && totalBtc >= minDepositForSplit;

    return {
      sacrificialVault: split.sacrificialVault,
      protectedVault: split.protectedVault,
      seizedFraction: split.seizedFraction,
      canSplit,
      minDepositForSplit,
    };
  }, [params, totalBtc, minDeposit]);

  return {
    ...result,
    isLoading,
    error,
  };
}
