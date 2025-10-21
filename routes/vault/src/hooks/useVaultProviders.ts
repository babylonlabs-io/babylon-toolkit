/**
 * Hook for fetching vault providers from the indexer API
 */

import { useQuery } from '@tanstack/react-query';
import { vaultIndexerAPI, type VaultProvider } from '../clients/api/vault-indexer';

interface UseVaultProvidersOptions {
  enabled?: boolean;
  refetchInterval?: number;
}

interface UseVaultProvidersReturn {
  providers: VaultProvider[];
  isLoading: boolean;
  error: Error | null;
  refetch: () => void;
}

/**
 * Fetch active vault providers from the indexer API
 * 
 * @param options - Query options
 * @returns Vault providers data with loading and error states
 */
export function useVaultProviders(
  options: UseVaultProvidersOptions = {},
): UseVaultProvidersReturn {
  const {
    data,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ['vaultProviders'],
    queryFn: () => vaultIndexerAPI.getVaultProviders(),
    enabled: options.enabled !== false,
    refetchInterval: options.refetchInterval,
    staleTime: 1000 * 60 * 5, // 5 minutes
    retry: 3,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
  });

  return {
    providers: data || [],
    isLoading,
    error: error as Error | null,
    refetch,
  };
}

