/**
 * Hook to fetch markets from API and validate them against Morpho contract
 *
 * This validates that each market ID from the API actually exists on-chain
 * in the Morpho contract, providing early detection of configuration issues.
 */

import { useQuery } from '@tanstack/react-query';
import { getMarketsWithValidation } from '../../../services/market';
import type { MarketWithValidation, MarketsWithValidationResult } from '../../../services/market';

const FIVE_MINUTES = 5 * 60 * 1000;

export const MARKETS_WITH_VALIDATION_KEY = 'MARKETS_WITH_VALIDATION';

// Re-export types for component usage
export type { MarketWithValidation, MarketsWithValidationResult };

/**
 * Hook to fetch Morpho markets from vault-indexer API and validate them on-chain
 */
export const useMarketsWithValidation = () => {
  return useQuery({
    queryKey: [MARKETS_WITH_VALIDATION_KEY],
    queryFn: getMarketsWithValidation,
    staleTime: FIVE_MINUTES,
  });
};
