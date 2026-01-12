import { getNetworkFees } from "@babylonlabs-io/ts-sdk";
import { useQuery } from "@tanstack/react-query";

import { getMempoolApiUrl } from "../clients/btc/config";

export const NETWORK_FEES_KEY = "NETWORK_FEES";

export interface FeeRates {
  /** Default fee rate for next-block confirmation (fastestFee from mempool) */
  defaultFeeRate: number;
  /** Whether fee rates are still loading */
  isLoading: boolean;
  /** Error if fee rates could not be fetched */
  error: Error | null;
}

/**
 * Fetches Bitcoin network fee recommendations from mempool.space API.
 *
 * Returns the fastestFee rate for next-block confirmation.
 * Auto-refetches every 60 seconds with retry logic (3 attempts).
 * Globally cached - all components share the same data.
 *
 * @returns Fee rate with loading/error state
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
      isLoading: false,
      error: null,
    };
  }

  return {
    defaultFeeRate: 0,
    isLoading: query.isLoading,
    error: query.error ?? null,
  };
}
