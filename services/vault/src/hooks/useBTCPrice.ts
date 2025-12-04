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
 *
 * Uses Chainlink's decentralized BTC/USD price feed for reliable, independent pricing.
 * Automatically selects the correct feed address based on the configured network:
 * - mainnet -> Ethereum mainnet Chainlink feed (0xF4030086522a5bEEa4988F8cA5B36dbC97BeE88c)
 * - signet -> Sepolia testnet Chainlink feed (0x1b44F3514812d835EB1BDB0acB33d3fA3351Ee43)
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
