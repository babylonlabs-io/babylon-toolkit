import { useQuery } from '@tanstack/react-query';
import { getVaultProviders } from '../clients/vault-providers-api';

const FIVE_MINUTES = 5 * 60 * 1000;

export const VAULT_PROVIDERS_KEY = 'VAULT_PROVIDERS';

/**
 * Hook to fetch vault providers
 */
export const useVaultProviders = () => {
  return useQuery({
    queryKey: [VAULT_PROVIDERS_KEY],
    queryFn: getVaultProviders,
    staleTime: FIVE_MINUTES,
  });
};
