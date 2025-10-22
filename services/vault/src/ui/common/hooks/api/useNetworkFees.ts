import { useQuery } from "@tanstack/react-query";

import { getNetworkFees } from "@/ui/common/utils/mempoolApi";

/**
 * Query key for network fees
 * Used by React Query for caching and cache invalidation
 */
export const NETWORK_FEES_KEY = "NETWORK_FEES";

/**
 * React Query hook for fetching Bitcoin network fee recommendations
 *
 * Provides real-time fee rate recommendations from mempool.space API with:
 * - Automatic refetching every 60 seconds (fees can change rapidly)
 * - 3 retry attempts on failure with exponential backoff
 * - 1 minute cache (staleTime)
 * - Loading states, error handling, and data caching
 *
 * The hook returns standard React Query result with:
 * - `data`: NetworkFees object with fee rates in sat/vb
 * - `isLoading`: Boolean indicating initial load
 * - `error`: Error object if request failed
 * - `refetch`: Function to manually refetch
 *
 * @param options - Optional configuration
 * @param options.enabled - Whether the query should run (default: true)
 *
 * @returns React Query result with network fees data
 *
 * @example
 * ```typescript
 * function PeginFlow() {
 *   const { data: fees, isLoading, error } = useNetworkFees();
 *
 *   if (isLoading) return <Loader />;
 *   if (error) return <Error message={error.message} />;
 *
 *   // Use hourFee for peg-in transactions (balance of speed and cost)
 *   const feeRate = fees?.hourFee || FALLBACK_FEE_RATE;
 *
 *   const fee = estimatePeginFee(peginAmount, utxoValue, feeRate);
 *   // ...
 * }
 * ```
 *
 * @example
 * ```typescript
 * // Disable automatic fetching until user initiates flow
 * const { data: fees } = useNetworkFees({ enabled: false });
 * ```
 */
export function useNetworkFees({ enabled = true }: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: [NETWORK_FEES_KEY],
    queryFn: getNetworkFees,
    staleTime: 60_000, // Consider data stale after 1 minute
    refetchInterval: 60_000, // Refetch every minute to keep fees current
    retry: 3, // Retry failed requests up to 3 times
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000), // Exponential backoff (1s, 2s, 4s, max 30s)
    enabled,
  });
}
