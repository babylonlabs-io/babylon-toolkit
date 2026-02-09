/**
 * Hook to fetch and cache vault providers and vault keepers (per-application)
 *
 * This hook fetches vault providers and vault keepers from the GraphQL indexer.
 * The data is cached per application controller using React Query.
 *
 * Note: Universal challengers are system-wide and should be accessed via
 * useProtocolParamsContext() instead.
 *
 * Since provider data rarely changes, we use aggressive caching:
 * - Cache for 5 minutes (staleTime)
 * - Keep in cache for 10 minutes (cacheTime)
 * - Fetch once on mount, don't refetch on window focus
 */

import { useQuery } from "@tanstack/react-query";
import { useCallback } from "react";

import { fetchAppProviders } from "../../services/providers";
import type {
  AppProvidersResponse,
  VaultKeeper,
  VaultProvider,
} from "../../types";

export interface UseVaultProvidersResult {
  /** Array of vault providers */
  vaultProviders: VaultProvider[];
  /** Array of vault keepers (per-application) */
  vaultKeepers: VaultKeeper[];
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
 * Hook to fetch vault providers and vault keepers from the GraphQL indexer
 *
 * Data is cached per application controller and shared across all components.
 * When applicationController changes, providers are re-fetched for the new application.
 *
 * Note: For universal challengers (system-wide), use useProtocolParamsContext() instead.
 *
 * @param applicationController - The application controller address to filter by.
 *                                If undefined or empty, the query is disabled.
 * @returns Hook result with vaultProviders, vaultKeepers, loading, error states
 */
export function useVaultProviders(
  applicationController?: string,
): UseVaultProvidersResult {
  const { data, isLoading, error, refetch } = useQuery<AppProvidersResponse>({
    queryKey: ["providers", applicationController],
    queryFn: () => fetchAppProviders(applicationController!),
    // Only fetch when applicationController is provided
    enabled: Boolean(applicationController),
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
      return data.vaultProviders.find(
        (p) => p.id.toLowerCase() === address.toLowerCase(),
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
    vaultProviders: data?.vaultProviders || [],
    vaultKeepers: data?.vaultKeepers ?? [],
    loading: isLoading,
    error: error as Error | null,
    refetch: wrappedRefetch,
    findProvider,
    findProviders,
  };
}
