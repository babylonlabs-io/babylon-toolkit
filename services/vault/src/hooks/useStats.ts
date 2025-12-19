/**
 * Stats Hook
 *
 * Fetches and transforms global vault statistics for display.
 * Combines stats data with BTC price for USD conversion.
 */

import { useQuery } from "@tanstack/react-query";

import { fetchStats, type Stats } from "../services/stats";
import { satoshiToBtcNumber } from "../utils/btcConversion";

import { useBTCPrice } from "./useBTCPrice";

/**
 * Transformed stats data for display
 */
export interface StatsData {
  totalTbvTvl: {
    btcAmount: number;
    usdValue: number;
  };
  totalTvlCollateral: {
    btcAmount: number;
    usdValue: number;
  };
}

export interface UseStatsResult {
  /** Transformed stats data ready for display, null if loading or error */
  data: StatsData | null;
  /** Raw stats data in satoshis (bigint) */
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
 *
 * Fetches stats from the indexer and transforms bigint satoshi values
 * to display-ready BTC and USD amounts.
 *
 * @returns Stats data with loading/error states
 */
export function useStats(): UseStatsResult {
  const { btcPriceUSD } = useBTCPrice();

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

  // Transform bigint satoshis to display values
  let data: StatsData | null = null;
  if (rawData) {
    const totalAvailableBtc = satoshiToBtcNumber(rawData.totalAvailableBtc);
    const totalCollateralBtc = satoshiToBtcNumber(rawData.totalCollateralBtc);
    data = {
      totalTbvTvl: {
        btcAmount: totalAvailableBtc,
        usdValue: totalAvailableBtc * btcPriceUSD,
      },
      totalTvlCollateral: {
        btcAmount: totalCollateralBtc,
        usdValue: totalCollateralBtc * btcPriceUSD,
      },
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
