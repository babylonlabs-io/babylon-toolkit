/**
 * Hook for fetching position-size parameters from the AaveIntegrationAdapter.
 *
 * Exposes the on-chain `maxVaultsPerPosition` cap — the source of truth for how
 * many BTC Vaults a single position may hold. We deliberately read this from
 * the contract rather than hardcoding a UI constant, since it is a protocol
 * parameter that governance can change.
 */

import { useQuery } from "@tanstack/react-query";

import { AaveAdapter } from "../clients";
import { getAaveAdapterAddress } from "../config";
import { CONFIG_RETRY_COUNT, CONFIG_STALE_TIME_MS } from "../constants";

export interface UsePositionSizeParamsResult {
  /**
   * Maximum number of BTC Vaults a position may hold (on-chain), or `null`
   * while loading/errored — or when the contract reports a non-positive cap
   * (treated as "unknown", so the cap is not enforced from a misconfig).
   */
  maxVaultsPerPosition: number | null;
  isLoading: boolean;
  error: Error | null;
}

export function usePositionSizeParams(): UsePositionSizeParamsResult {
  const adapterAddress = getAaveAdapterAddress();

  const { data, isLoading, error } = useQuery({
    queryKey: ["positionSizeParams", adapterAddress],
    queryFn: () => AaveAdapter.getPositionSizeParams(adapterAddress),
    enabled: Boolean(adapterAddress),
    staleTime: CONFIG_STALE_TIME_MS,
    refetchOnWindowFocus: false,
    retry: CONFIG_RETRY_COUNT,
  });

  // The cap is a small integer; Number() is safe. A non-positive value means
  // the contract has no meaningful cap configured — surface as null so callers
  // skip enforcement rather than blocking every deposit.
  const cap = data != null ? Number(data.maxVaultsPerPosition) : null;

  return {
    maxVaultsPerPosition: cap != null && cap > 0 ? cap : null,
    isLoading,
    error: (error as Error | null) ?? null,
  };
}
