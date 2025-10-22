/**
 * Hook for fetching Bitcoin network fee recommendations from mempool.space API
 *
 * Provides real-time fee rate recommendations for different confirmation priorities:
 * - fastestFee: Next block (~10 minutes)
 * - halfHourFee: ~3 blocks (~30 minutes)
 * - hourFee: ~6 blocks (~60 minutes) [RECOMMENDED for peg-ins]
 * - economyFee: No guarantee, may take hours/days
 * - minimumFee: Minimum relay fee (usually 1 sat/vb)
 *
 * This is copied from simple-staking implementation and adapted for vault usage.
 */

import { useQuery } from '@tanstack/react-query';

/**
 * Fee recommendations from mempool.space API
 * All values in sat/vbyte
 */
export type NetworkFees = {
  /** Fee for inclusion in the next block (~10 min) */
  fastestFee: number;

  /** Fee for inclusion within 30 minutes (~3 blocks) */
  halfHourFee: number;

  /** Fee for inclusion within 1 hour (~6 blocks) - RECOMMENDED */
  hourFee: number;

  /** Economy fee - inclusion not guaranteed, may take hours/days */
  economyFee: number;

  /** Minimum fee accepted by the network (usually 1 sat/vb) */
  minimumFee: number;
};

/**
 * Mempool API configuration
 * TODO: Move to shared config or environment variable
 */
const MEMPOOL_API_URL =
  process.env.NEXT_PUBLIC_MEMPOOL_API_URL || 'https://mempool.space';

/**
 * Fetches current fee recommendations from mempool.space API
 *
 * Endpoint: GET /api/v1/fees/recommended
 * Documentation: https://mempool.space/docs/api/rest#get-recommended-fees
 *
 * @returns Promise resolving to current network fee recommendations
 * @throws Error if API request fails or returns invalid data
 */
async function fetchNetworkFees(): Promise<NetworkFees> {
  const response = await fetch(`${MEMPOOL_API_URL}/api/v1/fees/recommended`);

  if (!response.ok) {
    throw new Error(
      `Failed to fetch network fees: ${response.status} ${response.statusText}`,
    );
  }

  const data = await response.json();

  // Validate response has expected structure
  if (
    typeof data.fastestFee !== 'number' ||
    typeof data.halfHourFee !== 'number' ||
    typeof data.hourFee !== 'number' ||
    typeof data.economyFee !== 'number' ||
    typeof data.minimumFee !== 'number'
  ) {
    throw new Error('Invalid fee data structure from mempool API');
  }

  return data;
}

/**
 * React Query hook for fetching and caching network fee recommendations
 *
 * Features:
 * - Auto-refetches every 60 seconds (fees can change rapidly)
 * - 3 retry attempts on failure
 * - Caches data for 1 minute (staleTime)
 * - Returns loading state, error, and data
 *
 * Usage:
 * ```typescript
 * const { data: fees, isLoading, error } = useNetworkFees();
 *
 * if (isLoading) return <Loader />;
 * if (error) return <Error message={error.message} />;
 *
 * // Use hourFee for peg-in transactions (balance of speed and cost)
 * const feeRate = fees?.hourFee || FALLBACK_FEE_RATE;
 * ```
 *
 * @returns React Query result with network fees data, loading state, and error
 */
export function useNetworkFees() {
  return useQuery({
    queryKey: ['networkFees'],
    queryFn: fetchNetworkFees,
    staleTime: 60_000, // Consider data stale after 1 minute
    refetchInterval: 60_000, // Refetch every minute
    retry: 3, // Retry 3 times on failure
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000), // Exponential backoff
  });
}
