/**
 * Query Invalidation Utilities
 *
 * Helpers for invalidating related queries after transactions.
 */

import type { QueryClient } from "@tanstack/react-query";

import { VAULTS_QUERY_KEY } from "../hooks/useVaults";

export const AAVE_USER_POSITION_QUERY_KEY = "aaveUserPosition";
/** Hub-wide liquidity per reserve (useAaveReserveLiquidity). */
export const AAVE_RESERVE_LIQUIDITY_QUERY_KEY = "aaveReserveLiquidity";
/** Our spoke's remaining borrow limit per reserve (useAaveReserveDrawHeadroom). */
export const AAVE_RESERVE_DRAW_HEADROOM_QUERY_KEY = "aaveReserveDrawHeadroom";
/** Our spoke's live hub config per reserve (useHubSpokeConfigs). */
export const AAVE_HUB_SPOKE_CONFIGS_QUERY_KEY = "aaveHubSpokeConfigs";

/**
 * Invalidate the Hub reads behind the loan forms after a borrow or repay: the
 * hub's liquidity and what our spoke has drawn against its borrow limit, which
 * the transaction moved, and our spoke's hub state, so the next action is
 * checked against a fresh read. Without this the form keeps showing the
 * pre-transaction figures until the next one-minute refresh.
 *
 * @param queryClient - React Query client instance
 */
export async function invalidateHubQueries(
  queryClient: QueryClient,
): Promise<void> {
  await Promise.all([
    queryClient.invalidateQueries({
      queryKey: [AAVE_RESERVE_LIQUIDITY_QUERY_KEY],
    }),
    queryClient.invalidateQueries({
      queryKey: [AAVE_RESERVE_DRAW_HEADROOM_QUERY_KEY],
    }),
    queryClient.invalidateQueries({
      queryKey: [AAVE_HUB_SPOKE_CONFIGS_QUERY_KEY],
    }),
  ]);
}

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
