/**
 * Hook for fetching vault split parameters from the Core Spoke contract.
 *
 * Fetches THF, CF, LB and converts them from on-chain formats (WAD/BPS)
 * to plain numbers for use in split calculations.
 */

import { useQuery } from "@tanstack/react-query";
import type { Address } from "viem";

import { AaveSpoke } from "../clients";
import { BPS_SCALE, CONFIG_STALE_TIME_MS } from "../constants";
import { useAaveConfig } from "../context";
import { wadToNumber } from "../utils";

const RETRY_COUNT = 3;

export interface VaultSplitParams {
  /** Target health factor (e.g. 1.10) */
  THF: number;
  /** Collateral factor (e.g. 0.75) */
  CF: number;
  /** Liquidation bonus (e.g. 1.05) */
  LB: number;
}

export interface UseVaultSplitParamsResult {
  /** Split params, or null while loading/errored */
  params: VaultSplitParams | null;
  isLoading: boolean;
  error: Error | null;
}

async function fetchSplitParams(
  spokeAddress: Address,
): Promise<VaultSplitParams> {
  const [thfWad, cfBps, lbWad] = await Promise.all([
    AaveSpoke.getTargetHealthFactor(spokeAddress),
    AaveSpoke.getCollateralFactor(spokeAddress),
    AaveSpoke.getLiquidationBonus(spokeAddress),
  ]);

  return {
    THF: wadToNumber(thfWad),
    CF: Number(cfBps) / BPS_SCALE,
    LB: wadToNumber(lbWad),
  };
}

export function useVaultSplitParams(): UseVaultSplitParamsResult {
  const { config } = useAaveConfig();
  const spokeAddress = config?.btcVaultCoreSpokeAddress as Address | undefined;

  const { data, isLoading, error } = useQuery({
    queryKey: ["vaultSplitParams", spokeAddress],
    queryFn: () => fetchSplitParams(spokeAddress!),
    enabled: !!spokeAddress,
    staleTime: CONFIG_STALE_TIME_MS,
    refetchOnWindowFocus: false,
    retry: RETRY_COUNT,
  });

  return {
    params: data ?? null,
    isLoading,
    error: error as Error | null,
  };
}
