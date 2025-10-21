/**
 * Hook to fetch markets from API and validate them against Morpho SDK
 *
 * This validates that each market ID from the API actually exists on-chain
 * in the Morpho contract, providing early detection of configuration issues.
 */

import { useQuery } from '@tanstack/react-query';
import { VaultApiClient } from '../../../clients/vault-api';
import { getVaultApiUrl, DEFAULT_TIMEOUT } from '../../../clients/vault-api/config';
import { Morpho } from '../../../clients/eth-contract';
import type { MorphoMarket } from '../../../clients/vault-api/types';

const FIVE_MINUTES = 5 * 60 * 1000;

export const MARKETS_WITH_VALIDATION_KEY = 'MARKETS_WITH_VALIDATION';

interface MarketWithValidation extends MorphoMarket {
  /** Whether this market exists on-chain in Morpho contract */
  isValid: boolean;
  /** Error message if validation failed */
  validationError?: string;
  /** On-chain market data from Morpho (if valid) */
  onChainData?: {
    totalSupplyAssets: bigint;
    totalBorrowAssets: bigint;
    utilizationPercent: number;
  };
}

interface MarketsWithValidationResult {
  markets: MarketWithValidation[];
  /** Whether all markets are valid */
  allValid: boolean;
  /** Markets that failed validation */
  invalidMarkets: MarketWithValidation[];
}

/**
 * Hook to fetch Morpho markets from vault-indexer API and validate them on-chain
 */
export const useMarketsWithValidation = () => {
  return useQuery({
    queryKey: [MARKETS_WITH_VALIDATION_KEY],
    queryFn: async (): Promise<MarketsWithValidationResult> => {
      // Step 1: Fetch markets from API
      const client = new VaultApiClient(getVaultApiUrl(), DEFAULT_TIMEOUT);
      const apiMarkets = await client.getMarkets();

      // Step 2: Validate each market on-chain and fetch data
      const validatedMarkets = await Promise.all(
        apiMarkets.map(async (market): Promise<MarketWithValidation> => {
          try {
            // Fetch market data directly from Morpho contract (no IRM calls)
            const onChainMarket = await Morpho.getMarketWithData(market.id);

            return {
              ...market,
              isValid: true,
              onChainData: {
                totalSupplyAssets: onChainMarket.totalSupplyAssets,
                totalBorrowAssets: onChainMarket.totalBorrowAssets,
                utilizationPercent: onChainMarket.utilizationPercent,
              },
            };
          } catch (error) {
            // Market doesn't exist on Morpho contract or fetch failed
            return {
              ...market,
              isValid: false,
              validationError: error instanceof Error ? error.message : 'Failed to fetch market from Morpho contract',
            };
          }
        })
      );

      // Step 3: Separate valid and invalid markets
      const invalidMarkets = validatedMarkets.filter(m => !m.isValid);
      const allValid = invalidMarkets.length === 0;

      return {
        markets: validatedMarkets,
        allValid,
        invalidMarkets,
      };
    },
    staleTime: FIVE_MINUTES,
  });
};
