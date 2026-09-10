/**
 * Query Invalidation Utilities
 *
 * Helpers for invalidating related queries after transactions.
 */

import type { QueryClient } from "@tanstack/react-query";

import { VAULTS_QUERY_KEY } from "../hooks/useVaults";

export const AAVE_USER_POSITION_QUERY_KEY = "aaveUserPosition";

/**
 * Invalidate vault-related queries after collateral operations
 *
 * Use this after:
 * - Successful activation (the vault becomes collateral)
 * - Successful withdraw collateral (the vault leaves the position)
 * - Successful reorder
 * - Successful borrow or repay
 *
 * @param queryClient - React Query client instance
 */
export async function invalidateVaultQueries(
  queryClient: QueryClient,
): Promise<void> {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: [VAULTS_QUERY_KEY] }),
    queryClient.invalidateQueries({
      queryKey: [AAVE_USER_POSITION_QUERY_KEY],
    }),
  ]);
}
