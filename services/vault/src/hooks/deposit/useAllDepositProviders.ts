/**
 * Hook to fetch vault providers for all applications present in deposits
 *
 * Since deposits can belong to different applications, this hook:
 * 1. Extracts unique applicationController addresses from activities
 * 2. Fetches providers for each application in parallel
 * 3. Merges results into a single flat list
 *
 * This enables the centralized polling manager to have all provider URLs
 * available without needing to fetch per-deposit.
 */

import { useQueries } from "@tanstack/react-query";
import { useMemo } from "react";

import { fetchProviders } from "../../services/providers";
import type { Liquidator, VaultProvider } from "../../types";
import type { VaultActivity } from "../../types/activity";

/** Provider data rarely changes, cache for 5 minutes */
const PROVIDER_STALE_TIME_MS = 5 * 60 * 1000;
/** Keep provider data in cache for 10 minutes */
const PROVIDER_GC_TIME_MS = 10 * 60 * 1000;

export interface UseAllDepositProvidersResult {
  /** All vault providers across all applications */
  vaultProviders: VaultProvider[];
  /** All liquidators across all applications */
  liquidators: Liquidator[];
  /** Loading state */
  loading: boolean;
  /** Error (first error encountered) */
  error: Error | null;
  /** Find provider by address (searches all applications) */
  findProvider: (address: string) => VaultProvider | undefined;
}

/**
 * Hook to fetch providers for all applications in the deposits list
 *
 * @param activities - List of vault activities to extract applications from
 * @returns Combined provider data from all applications
 */
export function useAllDepositProviders(
  activities: VaultActivity[],
): UseAllDepositProvidersResult {
  // Step 1: Extract unique application controllers from activities
  const applicationControllers = useMemo(() => {
    const controllers = new Set<string>();
    for (const activity of activities) {
      if (activity.applicationController) {
        controllers.add(activity.applicationController);
      }
    }
    return Array.from(controllers);
  }, [activities]);

  // Step 2: Fetch providers for each application in parallel
  const queries = useQueries({
    queries: applicationControllers.map((appController) => ({
      queryKey: ["providers", appController],
      queryFn: () => fetchProviders(appController),
      staleTime: PROVIDER_STALE_TIME_MS,
      gcTime: PROVIDER_GC_TIME_MS,
      refetchOnMount: false,
      refetchOnWindowFocus: false,
    })),
  });

  // Step 3: Merge results
  const { vaultProviders, liquidators, loading, error } = useMemo(() => {
    const allProviders: VaultProvider[] = [];
    const allLiquidators: Liquidator[] = [];
    let isLoading = false;
    let firstError: Error | null = null;

    for (const query of queries) {
      if (query.isLoading) {
        isLoading = true;
      }
      if (query.error && !firstError) {
        firstError = query.error as Error;
      }
      if (query.data) {
        // Dedupe by provider id
        for (const provider of query.data.vaultProviders) {
          if (!allProviders.some((p) => p.id === provider.id)) {
            allProviders.push(provider);
          }
        }
        for (const liquidator of query.data.liquidators) {
          if (!allLiquidators.some((l) => l.id === liquidator.id)) {
            allLiquidators.push(liquidator);
          }
        }
      }
    }

    return {
      vaultProviders: allProviders,
      liquidators: allLiquidators,
      loading: isLoading,
      error: firstError,
    };
  }, [queries]);

  // Step 4: Helper to find provider by address
  const findProvider = useMemo(() => {
    return (address: string): VaultProvider | undefined => {
      return vaultProviders.find(
        (p) => p.id.toLowerCase() === address.toLowerCase(),
      );
    };
  }, [vaultProviders]);

  return {
    vaultProviders,
    liquidators,
    loading,
    error,
    findProvider,
  };
}
