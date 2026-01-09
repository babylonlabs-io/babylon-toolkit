/**
 * Stats Hook
 *
 * Fetches and transforms global vault statistics for display.
 */

import { useQuery } from "@tanstack/react-query";

import { fetchStats, type Stats } from "../services/stats";
import { satoshiToBtcNumber } from "../utils/btcConversion";

import { usePrice } from "./usePrices";

/**
 * Transformed stats data for display
 */
export interface StatsData {
  /** Number of available vaults */
  vaultCount: number;
  /** Total TVL in BTC */
  tvlBtc: number;
  /** Total TVL in USD */
  tvlUsd: number;
}

export interface UseStatsResult {
  /** Transformed stats data ready for display, null if loading or error */
  data: StatsData | null;
  /** Raw stats data */
  rawData: Stats | undefined;
  /** Whether the stats are currently loading */
  isLoading: boolean;
  /** Error if the fetch failed */
  error: Error | null;
  /** Refetch function */
  refetch: () => void;
}

export const STATS_QUERY_KEY = "stats";

/**
 * Hook to fetch and transform global vault statistics
 */
export function useStats(): UseStatsResult {
  const btcPriceUSD = usePrice("BTC");

  const {
    data: rawData,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: [STATS_QUERY_KEY, "global"],
    queryFn: fetchStats,
    staleTime: 30000, // 30 seconds
    refetchInterval: 60000, // Refetch every minute
  });

  let data: StatsData | null = null;
  if (rawData) {
    const tvlBtc = satoshiToBtcNumber(rawData.totalAvailableSats);
    data = {
      vaultCount: rawData.availableVaultCount,
      tvlBtc,
      tvlUsd: tvlBtc * btcPriceUSD,
    };
  }

  return {
    data,
    rawData,
    isLoading,
    error: error as Error | null,
    refetch,
  };
}
