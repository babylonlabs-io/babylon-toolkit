/**
 * Query Invalidation Utilities
 *
 * Helpers for invalidating related queries after transactions.
 */

import type { QueryClient } from "@tanstack/react-query";
import type { Address } from "viem";

import { VAULTS_QUERY_KEY } from "../hooks/useVaults";

/**
 * Query key for the depositor's vault liquidation order. The address is
 * lowercased so callers with checksummed and lowercase addresses hit the
 * same cache entry.
 */
export function vaultOrderQueryKey(address: string): [string, string] {
  return ["vaultOrder", address.toLowerCase()];
}

/**
 * Invalidate vault-related queries after collateral operations
 *
 * Use this after:
 * - Successful add collateral (vaults become "In Use")
 * - Successful withdraw collateral (vaults become "Available")
 *
 * @param queryClient - React Query client instance
 * @param address - User's Ethereum address
 */
export async function invalidateVaultQueries(
  queryClient: QueryClient,
  address: Address,
): Promise<void> {
  await Promise.all([
    // Invalidate vaults query to refresh vault list
    queryClient.invalidateQueries({
      queryKey: [VAULTS_QUERY_KEY, address],
    }),

    // Invalidate Aave user position to refresh collateral amount
    queryClient.invalidateQueries({
      queryKey: ["aaveUserPosition", address],
    }),
  ]);
}
