import { useQuery } from '@tanstack/react-query';
import { VaultApiClient } from '../../../clients/vault-api';
import { getVaultApiUrl, DEFAULT_TIMEOUT } from '../../../clients/vault-api/config';

const FIVE_MINUTES = 5 * 60 * 1000;

export const MARKETS_KEY = 'MARKETS';

/**
 * Hook to fetch Morpho markets from vault-indexer API
 */
export const useMarkets = () => {
  return useQuery({
    queryKey: [MARKETS_KEY],
    queryFn: async () => {
      const client = new VaultApiClient(getVaultApiUrl(), DEFAULT_TIMEOUT);
      const markets = await client.getMarkets();
      return { markets };
    },
    staleTime: FIVE_MINUTES,
  });
};
