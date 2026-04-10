/**
 * Hook to fetch and cache vault providers and vault keepers (per-application)
 *
 * This hook fetches vault providers and vault keepers from the GraphQL indexer.
 * The data is cached per application entryPoint using React Query.
 *
 * Logos are fetched separately via useLogos hook to avoid blocking provider
 * data on the logo API. Providers are available immediately; logos are merged
 * when they arrive.
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
import { useCallback, useMemo } from "react";

import { useAaveConfig } from "../../applications/aave/context/AaveConfigContext";
import { fetchAppProviders } from "../../services/providers";
import type {
  AppProvidersResponse,
  VaultKeeper,
  VaultProvider,
} from "../../types";
import { toIdentity } from "../useLogos";
import { useUnhealthyVps } from "../useUnhealthyVps";
import { useWithLogos } from "../useWithLogos";

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
}

/**
 * Hook to fetch vault providers and vault keepers from the GraphQL indexer
 *
 * Data is cached per application entryPoint and shared across all components.
 * When applicationEntryPoint changes, providers are re-fetched for the new application.
 *
 * Note: For universal challengers (system-wide), use useProtocolParamsContext() instead.
 *
 * @param applicationEntryPoint - Optional override for the application entry point address.
 *                                When omitted, defaults to the Aave config's adapterAddress.
 * @returns Hook result with vaultProviders, vaultKeepers, loading, error states
 */
export function useVaultProviders(
  applicationEntryPoint?: string,
): UseVaultProvidersResult {
  const { config } = useAaveConfig();
  const entryPoint = applicationEntryPoint ?? config?.adapterAddress;

  const { data, isLoading, error, refetch } = useQuery<AppProvidersResponse>({
    queryKey: ["providers", entryPoint],
    queryFn: () => fetchAppProviders(entryPoint!),
    // Only fetch when entryPoint is provided
    enabled: Boolean(entryPoint),
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

  const unhealthyVps = useUnhealthyVps();

  // All providers with logos (unfiltered) — used by findProvider so that
  // existing vaults on temporarily unhealthy VPs remain resolvable.
  const allProviders = data?.vaultProviders ?? [];
  const allProvidersWithLogos = useWithLogos(allProviders, (p) =>
    toIdentity(p.btcPubKey),
  );

  // Filtered list for selection UI — excludes unhealthy VPs.
  const vaultProvidersWithLogos = useMemo(() => {
    if (unhealthyVps.size === 0) return allProvidersWithLogos;
    return allProvidersWithLogos.filter(
      (p) => !unhealthyVps.has(p.id.toLowerCase()),
    );
  }, [allProvidersWithLogos, unhealthyVps]);

  // Find provider by address — searches ALL providers (including unhealthy)
  // so that vault management flows (payout signing, dashboard) still work
  // for existing vaults on temporarily degraded VPs.
  const findProvider = useCallback(
    (address: string): VaultProvider | undefined => {
      return allProvidersWithLogos.find(
        (p) => p.id.toLowerCase() === address.toLowerCase(),
      );
    },
    [allProvidersWithLogos],
  );

  // Wrap refetch to return Promise<void>
  const wrappedRefetch = async () => {
    await refetch();
  };

  return {
    vaultProviders: vaultProvidersWithLogos,
    vaultKeepers: data?.vaultKeepers ?? [],
    loading: isLoading,
    error: error as Error | null,
    refetch: wrappedRefetch,
    findProvider,
  };
}
