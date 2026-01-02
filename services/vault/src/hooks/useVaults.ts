/**
 * Hook to fetch vaults for a depositor
 */

import { useQuery } from "@tanstack/react-query";
import type { Address } from "viem";

import { fetchVaultsByDepositor } from "../services/vault/fetchVaults";

export const VAULTS_QUERY_KEY = "vaults";

/** Polling interval when waiting for indexer to confirm pending deposits */
const PENDING_REFETCH_INTERVAL = 5 * 1000; // 5 seconds

interface UseVaultsOptions {
  /** Enable polling when true (e.g., when there are pending deposits) */
  poll?: boolean;
}

/**
 * Hook to fetch vaults for a depositor
 *
 * @param depositorAddress - Depositor's Ethereum address
 * @param options - Optional configuration (poll: enable polling for pending deposits)
 * @returns Query result with vault data
 */
export function useVaults(
  depositorAddress: Address | undefined,
  options: UseVaultsOptions = {},
) {
  const { poll = false } = options;

  return useQuery({
    queryKey: [VAULTS_QUERY_KEY, depositorAddress],
    queryFn: () => fetchVaultsByDepositor(depositorAddress!),
    enabled: !!depositorAddress,
    staleTime: 60 * 1000, // 1 minute
    gcTime: 5 * 60 * 1000, // 5 minutes
    refetchOnWindowFocus: false,
    refetchInterval: poll ? PENDING_REFETCH_INTERVAL : false,
  });
}
