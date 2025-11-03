/**
 * MIGRATED TO NEW ARCHITECTURE
 *
 * This hook now uses the clean architecture implementation from:
 * src/presentation/hooks/useVaultProviders.ts
 *
 * This file is kept as a compatibility layer to avoid breaking existing imports.
 * It simply re-exports the new implementation.
 *
 * @deprecated Use `@/presentation/hooks/useVaultProviders` directly in new code
 */

import { useQuery } from "@tanstack/react-query";
import { useCallback } from "react";

import { VaultProviderRepository } from "../../../../infrastructure/repositories/VaultProviderRepository";
import type { VaultProvider } from "../../../../types";

// Create repository instance (in production, use dependency injection)
const vaultProviderRepository = new VaultProviderRepository();

export interface UseVaultProvidersResult {
  /** Array of vault providers */
  providers: VaultProvider[];
  /** Loading state - true while fetching */
  loading: boolean;
  /** Error state */
  error: Error | null;
  /** Function to manually refetch */
  refetch: () => Promise<void>;
  /** Find provider by Ethereum address */
  findProvider: (address: string) => VaultProvider | undefined;
}

/**
 * Hook to fetch vault providers using clean architecture
 *
 * MIGRATION NOTE: Now uses the repository pattern instead of direct service calls.
 * The repository handles caching internally, so React Query caching is kept for UI consistency.
 *
 * @returns Hook result with providers, loading, error states
 */
export function useVaultProviders(): UseVaultProvidersResult {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["vaultProviders"],
    queryFn: async () => {
      // Use the new repository pattern
      const domainProviders = await vaultProviderRepository.findActive();

      // Convert domain objects to existing VaultProvider type for backward compatibility
      return domainProviders.map(
        (provider) =>
          ({
            id: provider.getId(),
            btc_pub_key: provider.getBtcPublicKey(),
            url: "",
            liquidators: [],
          }) as VaultProvider,
      );
    },
    // Fetch once on mount
    refetchOnMount: false,
    // Don't refetch on window focus
    refetchOnWindowFocus: false,
    // Don't refetch on reconnect
    refetchOnReconnect: false,
    // Consider data fresh for 5 minutes
    staleTime: 5 * 60 * 1000,
    // Keep in cache for 10 minutes
    gcTime: 10 * 60 * 1000,
    // Retry once on failure
    retry: 1,
  });

  // Helper function to find provider by address
  // Memoized to prevent unnecessary re-renders in consuming components
  const findProvider = useCallback(
    (address: string): VaultProvider | undefined => {
      if (!data) return undefined;
      return data.find(
        (p: VaultProvider) => p.id.toLowerCase() === address.toLowerCase(),
      );
    },
    [data],
  );

  // Wrap refetch to return Promise<void> and clear repository cache
  const wrappedRefetch = async () => {
    // Clear the repository cache before refetching
    vaultProviderRepository.clearCache();
    await refetch();
  };

  return {
    providers: data || [],
    loading: isLoading,
    error: error as Error | null,
    refetch: wrappedRefetch,
    findProvider,
  };
}
