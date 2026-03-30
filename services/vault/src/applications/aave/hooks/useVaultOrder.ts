/**
 * Hook for fetching vault ordering from the indexer.
 *
 * The indexer tracks VaultsReordered events and maintains a
 * liquidationIndex field on each collateral entry.
 */

import { useQuery } from "@tanstack/react-query";
import type { Hex } from "viem";

import { CONFIG_RETRY_COUNT, CONFIG_STALE_TIME_MS } from "../constants";
import { fetchAavePositionCollaterals } from "../services";

export interface UseVaultOrderResult {
  /** Vault IDs in their liquidation-priority order (index 0 seized first) */
  vaultIds: Hex[] | null;
  isLoading: boolean;
  error: Error | null;
}

async function fetchVaultOrder(userAddress: string): Promise<Hex[]> {
  const collaterals = await fetchAavePositionCollaterals(userAddress);

  return collaterals
    .filter((c) => c.removedAt === null)
    .sort((a, b) => (a.liquidationIndex ?? 0) - (b.liquidationIndex ?? 0))
    .map((c) => c.vaultId as Hex);
}

/**
 * Fetch vault ordering for a user from the indexer.
 *
 * Returns vault IDs sorted by liquidationIndex ascending
 * (index 0 is seized first during liquidation).
 *
 * @param userAddress - User's Ethereum address, or undefined if not connected
 */
export function useVaultOrder(
  userAddress: string | undefined,
): UseVaultOrderResult {
  const { data, isLoading, error } = useQuery({
    queryKey: ["vaultOrder", userAddress?.toLowerCase()],
    queryFn: () => fetchVaultOrder(userAddress!),
    enabled: !!userAddress,
    staleTime: CONFIG_STALE_TIME_MS,
    refetchOnWindowFocus: false,
    retry: CONFIG_RETRY_COUNT,
  });

  return {
    vaultIds: data ?? null,
    isLoading,
    error: error as Error | null,
  };
}
