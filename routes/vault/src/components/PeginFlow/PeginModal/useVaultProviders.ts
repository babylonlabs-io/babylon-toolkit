import { useQuery } from '@tanstack/react-query';
import { VaultApiClient } from '../../../clients/vault-api';
import { getVaultApiUrl, DEFAULT_TIMEOUT } from '../../../clients/vault-api/config';

const FIVE_MINUTES = 5 * 60 * 1000;

export const VAULT_PROVIDERS_KEY = 'VAULT_PROVIDERS';

/**
 * Hook to fetch vault providers from vault-indexer API
 */
export const useVaultProviders = () => {
  return useQuery({
    queryKey: [VAULT_PROVIDERS_KEY],
    queryFn: async () => {
      const client = new VaultApiClient(getVaultApiUrl(), DEFAULT_TIMEOUT);
      const providers = await client.getProviders();

      // Transform to match expected format for UI
      return {
        providers: providers.map((provider) => ({
          id: provider.id,
          btc_pub_key: provider.btc_pub_key,
          url: provider.url,
        })),
      };
    },
    staleTime: FIVE_MINUTES,
  });
};
