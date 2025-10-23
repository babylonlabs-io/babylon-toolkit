import { useQuery } from '@tanstack/react-query';
import { getVaultProviders } from '../../../services/vault';

const FIVE_MINUTES = 5 * 60 * 1000;

export const VAULT_PROVIDERS_KEY = 'VAULT_PROVIDERS';

/**
 * Hook to fetch vault providers from vault-indexer API
 *
 * This is a thin wrapper around the vault provider service,
 * adding React Query for caching and automatic refetching.
 */
export const useVaultProviders = () => {
  return useQuery({
    queryKey: [VAULT_PROVIDERS_KEY],
    queryFn: async () => {
      const providers = await getVaultProviders();
      return { providers };
    },
    staleTime: FIVE_MINUTES,
  });
};
