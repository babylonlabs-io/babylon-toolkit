import { useETHWallet } from "@babylonlabs-io/wallet-connector";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import type { Address } from "viem";

import {
  convertOraclePriceToUSD,
  getOraclePrice,
} from "../clients/eth-contract/oracle/query";

import { useMarkets } from "./useMarkets";

export interface UseBTCPriceResult {
  btcPriceUSD: number;
  loading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
}

/**
 * Hook to fetch BTC price from Morpho oracle
 * Uses the first available market's oracle to get BTC/USDC price
 */
export function useBTCPrice(): UseBTCPriceResult {
  const { address } = useETHWallet();
  const {
    markets,
    loading: isMarketsLoading,
    error: marketsError,
  } = useMarkets();

  // Find the first market with an oracle (BTC/USDC market)
  const btcMarket = useMemo(() => {
    return markets.find(
      (market) => market.collateral_token && market.oracle && market.loan_token,
    );
  }, [markets]);

  const {
    data: btcPriceUSD,
    isLoading: isPriceLoading,
    error: priceError,
    refetch: refetchPrice,
  } = useQuery<number>({
    queryKey: ["btcPrice", btcMarket?.oracle, address],
    queryFn: async () => {
      if (!btcMarket?.oracle) {
        throw new Error("No BTC market with oracle found");
      }

      const oraclePrice = await getOraclePrice(btcMarket.oracle as Address);
      return convertOraclePriceToUSD(oraclePrice);
    },
    enabled: !!btcMarket?.oracle && !!address,
    retry: 2,
    staleTime: 30000, // 30 seconds
    refetchInterval: 60000, // Refetch every minute
  });

  const wrappedRefetch = async () => {
    await refetchPrice();
  };

  return {
    btcPriceUSD: btcPriceUSD || 0,
    loading: isMarketsLoading || isPriceLoading,
    error: (marketsError || priceError) as Error | null,
    refetch: wrappedRefetch,
  };
}
