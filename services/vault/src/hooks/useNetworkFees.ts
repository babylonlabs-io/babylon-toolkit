import { getNetworkFees } from "@babylonlabs-io/ts-sdk";
import { useQuery } from "@tanstack/react-query";

import { getMempoolApiUrl } from "../clients/btc/config";

const NETWORK_FEES_KEY = "NETWORK_FEES";

export interface FeeRates {
  /** Default fee rate for next-block confirmation (fastestFee from mempool) */
  defaultFeeRate: number;
  /** ~30 minute confirmation estimate (halfHourFee) */
  halfHourFeeRate: number;
  /** ~60 minute confirmation estimate (hourFee) */
  hourFeeRate: number;
  /** Whether fee rates are still loading */
  isLoading: boolean;
  /** Error if fee rates could not be fetched */
  error: Error | null;
}

/**
 * Fetches Bitcoin network fee recommendations from mempool.space API.
 *
 * Defaults to fastestFee for next-block confirmation; also exposes slower
 * tiers for fee-rate pickers. Auto-refetches every 60 seconds with retry
 * logic (3 attempts). Globally cached — all components share the same data.
 */
export function useNetworkFees(): FeeRates {
  const query = useQuery({
    queryKey: [NETWORK_FEES_KEY],
    queryFn: () => getNetworkFees(getMempoolApiUrl()),
    staleTime: 60_000,
    refetchInterval: 60_000,
    retry: 3,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
  });

  if (query.data) {
    return {
      defaultFeeRate: query.data.fastestFee,
      halfHourFeeRate: query.data.halfHourFee,
      hourFeeRate: query.data.hourFee,
      isLoading: false,
      error: null,
    };
  }

  return {
    defaultFeeRate: 0,
    halfHourFeeRate: 0,
    hourFeeRate: 0,
    isLoading: query.isLoading,
    error: query.error ?? null,
  };
}
