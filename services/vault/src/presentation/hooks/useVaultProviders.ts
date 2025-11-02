import { useCallback, useEffect, useState } from "react";

import { VaultProviderDTO } from "../../application/dtos/DepositDTO";
import { DepositMapper } from "../../application/mappers/DepositMapper";
import { VaultProviderRepository } from "../../infrastructure/repositories/VaultProviderRepository";

// Singleton instance - in production, use dependency injection
const vaultProviderRepository = new VaultProviderRepository();

/**
 * Hook for fetching vault providers using the clean architecture.
 */
export function useVaultProviders() {
  const [providers, setProviders] = useState<VaultProviderDTO[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const fetchProviders = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const domainProviders = await vaultProviderRepository.findActive();
      const dtoProviders = domainProviders.map((provider) =>
        DepositMapper.providerToDTO(provider),
      );
      setProviders(dtoProviders);
    } catch (err) {
      const error =
        err instanceof Error ? err : new Error("Failed to fetch providers");
      setError(error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const getProviderById = useCallback(
    (id: string) => {
      return providers.find((p) => p.id === id);
    },
    [providers],
  );

  const refetch = useCallback(() => {
    // Clear cache and refetch
    vaultProviderRepository.clearCache();
    return fetchProviders();
  }, [fetchProviders]);

  // Initial fetch
  useEffect(() => {
    fetchProviders();
  }, [fetchProviders]);

  return {
    providers,
    isLoading,
    error,
    getProviderById,
    refetch,
  };
}
