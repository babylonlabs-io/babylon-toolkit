/**
 * Hook for fetching markets from the Vault Indexer API
 */

import { useQuery } from "@tanstack/react-query";

import { getMarkets } from "../services/market";
import type { MorphoMarket } from "../types";

/**
 * Result interface for useMarkets hook
 */
export interface UseMarketsResult {
  /** Array of markets from API */
  markets: MorphoMarket[];
  /** Loading state - true while fetching data */
  loading: boolean;
  /** Error state - contains error if fetch failed */
  error: Error | null;
  /** Function to manually refetch data */
  refetch: () => Promise<void>;
}

/**
 * Custom hook to fetch markets from the Vault Indexer API
 *
 * @returns Object containing markets array, loading state, error state, and refetch function
 */
export function useMarkets(): UseMarketsResult {
  // Use React Query to fetch data from service layer
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["markets"],
    queryFn: async () => {
      return getMarkets();
    },
    retry: 2,
    staleTime: 60000, // 1 minute
  });

  // Wrap refetch to return Promise<void> for consistency
  const wrappedRefetch = async () => {
    await refetch();
  };

  return {
    markets: data || [],
    loading: isLoading,
    error: error as Error | null,
    refetch: wrappedRefetch,
  };
}
