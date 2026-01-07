import { getBTCNetwork } from "@babylonlabs-io/config";
import { useQuery } from "@tanstack/react-query";

import { getBTCPriceUSD } from "../clients/eth-contract/chainlink/query";

export interface UseBTCPriceResult {
  btcPriceUSD: number;
  loading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
}

/**
 * Hook to fetch BTC price from Chainlink oracle
 */
export function useBTCPrice(): UseBTCPriceResult {
  const network = getBTCNetwork();

  const {
    data: btcPriceUSD,
    isLoading,
    error,
    refetch: refetchPrice,
  } = useQuery<number>({
    queryKey: ["btcPrice", "chainlink", network],
    queryFn: getBTCPriceUSD,
    retry: 2,
    staleTime: 30000, // 30 seconds
    refetchInterval: 60000, // Refetch every minute
  });

  const wrappedRefetch = async () => {
    await refetchPrice();
  };

  return {
    btcPriceUSD: btcPriceUSD || 0,
    loading: isLoading,
    error: error as Error | null,
    refetch: wrappedRefetch,
  };
}
