/**
 * Hook to fetch vaults for a depositor
 */

import { useQuery } from "@tanstack/react-query";
import type { Address } from "viem";

import { fetchVaultsByDepositor } from "../services/vault/fetchVaults";

export const VAULTS_QUERY_KEY = "vaults";

/**
 * Hook to fetch vaults for a depositor
 *
 * @param depositorAddress - Depositor's Ethereum address
 * @returns Query result with vault data
 */
export function useVaults(depositorAddress: Address | undefined) {
  return useQuery({
    queryKey: [VAULTS_QUERY_KEY, depositorAddress],
    queryFn: () => fetchVaultsByDepositor(depositorAddress!),
    enabled: !!depositorAddress,
    staleTime: 60 * 1000, // 1 minute
    gcTime: 5 * 60 * 1000, // 5 minutes
    refetchOnWindowFocus: false,
  });
}
