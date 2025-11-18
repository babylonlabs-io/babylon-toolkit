/**
 * Query Key Factory and Invalidation Utilities
 *
 * Centralizes query key definitions and provides helpers for invalidating
 * related queries after transactions.
 */

import type { QueryClient } from "@tanstack/react-query";
import type { Address } from "viem";

import { CONTRACTS } from "../config/contracts";

/**
 * Query key factory for consistent key generation
 */
export const queryKeys = {
  /** Vaults available for use as collateral in borrowing */
  borrowableVaults: (address: Address) =>
    ["borrowableVaults", address] as const,

  /** Peg-in requests with vault usage status */
  peginRequests: (address: Address) =>
    [
      "peginRequests",
      address,
      CONTRACTS.BTC_VAULTS_MANAGER,
      CONTRACTS.MORPHO_CONTROLLER,
    ] as const,

  /** User position for a specific market */
  userPositionForMarket: (
    address: Address,
    marketId: string,
    controllerAddress: Address = CONTRACTS.MORPHO_CONTROLLER,
  ) => ["userPositionForMarket", address, marketId, controllerAddress] as const,

  /** Market data */
  marketData: (marketId: string) => ["marketData", marketId] as const,
};

/**
 * Invalidate vault-related queries after borrow/repay transactions
 *
 * Use this after:
 * - Successful borrow (vaults become "In Use")
 * - Successful repay with withdrawal (vaults become "Available")
 *
 * @param queryClient - React Query client instance
 * @param address - User's Ethereum address
 */
export async function invalidateVaultQueries(
  queryClient: QueryClient,
  address: Address,
): Promise<void> {
  await Promise.all([
    // Invalidate borrowable vaults to refresh available collateral list
    queryClient.invalidateQueries({
      queryKey: queryKeys.borrowableVaults(address),
    }),

    // Invalidate pegin requests to update vault usage status (isInUse)
    queryClient.invalidateQueries({
      queryKey: queryKeys.peginRequests(address),
    }),
  ]);
}
