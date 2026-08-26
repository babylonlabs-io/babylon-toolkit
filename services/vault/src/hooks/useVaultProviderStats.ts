/**
 * Hook that fetches per-vault-provider activity stats (total active BTC and
 * most-recent-successful-peg-in timestamp) from the GraphQL indexer.
 *
 * Stats are display/sort-only: the deposit picker shows providers as soon as
 * the registry list resolves and fills these values in when they arrive, the
 * same merge-when-ready pattern used for provider logos.
 */

import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";

import {
  fetchVaultProviderStats,
  type VaultProviderStats,
} from "../services/providers";

/** Provider activity changes slowly; cache generously to avoid refetch churn. */
const STALE_TIME_MS = 5 * 60 * 1000;

const EMPTY_STATS: ReadonlyMap<string, VaultProviderStats> = new Map();

export interface UseVaultProviderStatsResult {
  /** Stats keyed by lowercased VP address. VPs absent had no resolvable stats. */
  statsById: ReadonlyMap<string, VaultProviderStats>;
  /** True while the first fetch is in flight. */
  loading: boolean;
}

/**
 * @param vaultProviderIds - VP Ethereum addresses to fetch stats for.
 */
export function useVaultProviderStats(
  vaultProviderIds: string[],
): UseVaultProviderStatsResult {
  // Lowercase + sort so the query key is stable regardless of the caller's
  // ordering or address casing.
  const normalizedIds = useMemo(
    () => vaultProviderIds.map((id) => id.toLowerCase()).sort(),
    [vaultProviderIds],
  );

  const { data, isLoading } = useQuery({
    queryKey: ["vaultProviderStats", normalizedIds],
    queryFn: () => fetchVaultProviderStats(normalizedIds),
    enabled: normalizedIds.length > 0,
    staleTime: STALE_TIME_MS,
    refetchOnWindowFocus: false,
    retry: 1,
  });

  return {
    statsById: data ?? EMPTY_STATS,
    loading: normalizedIds.length > 0 && isLoading,
  };
}
