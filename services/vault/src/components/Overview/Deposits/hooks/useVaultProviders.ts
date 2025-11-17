/**
 * Hook to fetch and cache vault providers
 *
 * This hook fetches the list of registered vault providers from the indexer API.
 * The data is cached globally using React Query and shared across all components.
 *
 * Since provider data rarely changes, we use aggressive caching:
 * - Cache for 5 minutes (staleTime)
 * - Keep in cache for 10 minutes (cacheTime)
 * - Fetch once on mount, don't refetch on window focus
 */

import { useQuery } from "@tanstack/react-query";
import { useCallback } from "react";

import { getVaultProviders } from "../../../../services/vault";
import type { VaultProvider } from "../../../../types";

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
  /** Find multiple providers by array of Ethereum addresses */
  findProviders: (addresses: string[]) => Array<{
    id: string;
    name: string;
    icon: string | null;
  }>;
}

/**
 * Hook to fetch vault providers from the indexer
 *
 * Data is cached globally and shared across all components.
 * Will only fetch once unless manually refetched.
 *
 * @returns Hook result with providers, loading, error states
 */
export function useVaultProviders(): UseVaultProvidersResult {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["vaultProviders"],
    queryFn: async () => {
      return getVaultProviders();
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

  // Helper function to find multiple providers by addresses
  // Returns formatted provider objects with fallback for unknown providers
  const findProviders = useCallback(
    (
      addresses: string[],
    ): Array<{ id: string; name: string; icon: string | null }> => {
      return addresses.map((address) => {
        const provider = findProvider(address);
        return provider
          ? { id: provider.id, name: provider.id, icon: null }
          : { id: address, name: address, icon: null };
      });
    },
    [findProvider],
  );

  // Wrap refetch to return Promise<void>
  const wrappedRefetch = async () => {
    await refetch();
  };

  return {
    providers: data || [],
    loading: isLoading,
    error: error as Error | null,
    refetch: wrappedRefetch,
    findProvider,
    findProviders,
  };
}
