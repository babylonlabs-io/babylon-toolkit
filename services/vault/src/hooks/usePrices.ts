/**
 * Token Prices Hook
 *
 * Provides access to real-time token prices from Chainlink oracles.
 * Prices are cached for 1 minute and automatically refetched when stale.
 */

import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";

import {
  getTokenPrices,
  type PriceMetadata,
} from "@/clients/eth-contract/chainlink";

const PRICES_QUERY_KEY = "prices";
const ONE_MINUTE = 60 * 1000;

const SUPPORTED_TOKENS = ["BTC", "ETH", "USDC", "USDT", "DAI"];

export interface UsePricesResult {
  /** Record mapping token symbols to their USD prices */
  prices: Record<string, number>;
  /** Metadata about price freshness and errors per token */
  metadata: Record<string, PriceMetadata>;
  /** Whether prices are currently being fetched */
  isLoading: boolean;
  /** Error if the price fetch failed */
  error: Error | null;
  /** Whether any price data is stale (older than 1 hour) */
  hasStalePrices: boolean;
  /** Whether any price fetch failed */
  hasPriceFetchError: boolean;
}

/**
 * Hook to fetch token prices from Chainlink oracles
 *
 * Prices are cached for 1 minute and include BTC, ETH, USDC, USDT, DAI
 *
 * @returns Object containing prices record, loading state, error, and metadata
 */
export function usePrices(): UsePricesResult {
  const { data, isLoading, error } = useQuery({
    queryKey: [PRICES_QUERY_KEY, "chainlink"],
    queryFn: () => getTokenPrices(SUPPORTED_TOKENS),
    staleTime: ONE_MINUTE,
    refetchInterval: ONE_MINUTE,
    retry: 2,
  });

  const hasStalePrices = useMemo(() => {
    if (!data?.metadata) return false;
    return Object.values(data.metadata).some((meta) => meta.isStale);
  }, [data?.metadata]);

  const hasPriceFetchError = useMemo(() => {
    if (!data?.metadata) return false;
    return Object.values(data.metadata).some((meta) => meta.fetchFailed);
  }, [data?.metadata]);

  return {
    prices: data?.prices ?? {},
    metadata: data?.metadata ?? {},
    isLoading,
    error: error as Error | null,
    hasStalePrices,
    hasPriceFetchError,
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
