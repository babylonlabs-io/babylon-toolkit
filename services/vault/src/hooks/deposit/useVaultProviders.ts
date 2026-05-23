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
import { useCallback } from "react";

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

const EMPTY_VAULT_PROVIDERS: VaultProvider[] = [];
const EMPTY_VAULT_KEEPERS: VaultKeeper[] = [];
const getProviderIdentity = (p: VaultProvider) => toIdentity(p.btcPubKey);

export interface UseVaultProvidersResult {
  /**
   * Every vault provider — including runtime-unhealthy and metadata-rejected
   * ones. The deposit picker uses this so unhealthy VPs can be shown (sorted
   * to the bottom with a warning) rather than hidden.
   */
  allVaultProviders: VaultProvider[];
  /** Lowercased Ethereum addresses of runtime-unhealthy VPs (per `/vp-health`). */
  unhealthyVpIds: ReadonlySet<string>;
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

  // All providers with logos (unfiltered) — used by every caller. The
  // deposit picker sorts unhealthy / metadata-rejected VPs to the bottom
  // instead of hiding them, and findProvider must resolve any provider that
  // existing vaults are bound to (including ones whose rpcUrl later went bad).
  const allProviders = data?.vaultProviders ?? EMPTY_VAULT_PROVIDERS;
  const allProvidersWithLogos = useWithLogos(allProviders, getProviderIdentity);

  // Find provider by address — searches ALL providers (including unhealthy
  // and metadata-rejected) so that vault management flows (payout signing,
  // dashboard, refund) still work for existing vaults bound to a provider
  // whose rpcUrl later went bad.
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
    allVaultProviders: allProvidersWithLogos,
    unhealthyVpIds: unhealthyVps,
    vaultKeepers: data?.vaultKeepers ?? EMPTY_VAULT_KEEPERS,
    loading: isLoading,
    error: error as Error | null,
    refetch: wrappedRefetch,
    findProvider,
  };
}
