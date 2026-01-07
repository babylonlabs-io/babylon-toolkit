/**
 * Token Prices Hook
 *
 * Provides access to real-time token prices from Chainlink oracles.
 * Prices are cached for 1 minute and automatically refetched when stale.
 */

import { useQuery } from "@tanstack/react-query";

import { getTokenPrices } from "@/clients/eth-contract/chainlink";

const PRICES_QUERY_KEY = "prices";
const ONE_MINUTE = 60 * 1000;

const SUPPORTED_TOKENS = ["BTC", "ETH", "USDC", "USDT", "DAI"];

export interface UsePricesResult {
  /** Record mapping token symbols to their USD prices */
  prices: Record<string, number>;
  /** Whether prices are currently being fetched */
  isLoading: boolean;
  /** Error if the price fetch failed */
  error: Error | null;
}

/**
 * Hook to fetch token prices from Chainlink oracles
 *
 * Prices are cached for 1 minute and include BTC, ETH, USDC, USDT, DAI
 *
 * @returns Object containing prices record, loading state, and error
 */
export function usePrices(): UsePricesResult {
  const { data, isLoading, error } = useQuery({
    queryKey: [PRICES_QUERY_KEY, "chainlink"],
    queryFn: () => getTokenPrices(SUPPORTED_TOKENS),
    staleTime: ONE_MINUTE,
    refetchInterval: ONE_MINUTE,
    retry: 2,
  });

  return {
    prices: data ?? {},
    isLoading,
    error: error as Error | null,
  };
}

/**
 * Hook to get the USD price for a specific token
 *
 * @param symbol - Token symbol (e.g., "BTC", "BABY")
 * @returns USD price of the token, or 0 if not available
 */
export function usePrice(symbol: string): number {
  const { prices } = usePrices();
  return prices[symbol] ?? 0;
}
