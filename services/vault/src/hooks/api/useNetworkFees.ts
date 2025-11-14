import { useQuery } from "@tanstack/react-query";

import { getNetworkFees } from "../../clients/btc/mempool";

export const NETWORK_FEES_KEY = "NETWORK_FEES";

/**
 * Fetches Bitcoin network fee recommendations from mempool.space API.
 * Auto-refetches every 60 seconds with retry logic.
 *
 * @param options.enabled - Whether the query should run (default: true)
 * @returns React Query result with NetworkFees data
 */
export function useNetworkFees({ enabled = true }: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: [NETWORK_FEES_KEY],
    queryFn: getNetworkFees,
    staleTime: 60_000,
    refetchInterval: 60_000,
    retry: 3,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
    enabled,
  });
}
