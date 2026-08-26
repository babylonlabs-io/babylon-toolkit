/**
 * Hook that reads each vault provider's commission (basis points) from the
 * BTCVaultRegistry contract.
 *
 * The commission shown in the picker is informational — the binding rate a
 * deposit pays is re-read and bounded by the SDK at submit time — so a failed
 * read degrades to a placeholder rather than blocking provider selection.
 */

import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";

import { fetchVaultProviderCommissions } from "@/clients/eth-contract/btc-vault-registry/commission";

/** Commissions change rarely; cache generously to avoid redundant reads. */
const STALE_TIME_MS = 5 * 60 * 1000;

const EMPTY_COMMISSIONS: ReadonlyMap<string, number> = new Map();

export interface UseVaultProviderCommissionsResult {
  /** Commission in bps keyed by lowercased VP address. Absent ⇒ read failed. */
  commissionsById: ReadonlyMap<string, number>;
  /** True while the first read is in flight. */
  loading: boolean;
}

/**
 * @param vaultProviderIds - VP Ethereum addresses to read commissions for.
 */
export function useVaultProviderCommissions(
  vaultProviderIds: string[],
): UseVaultProviderCommissionsResult {
  const normalizedIds = useMemo(
    () => vaultProviderIds.map((id) => id.toLowerCase()).sort(),
    [vaultProviderIds],
  );

  const { data, isLoading } = useQuery({
    queryKey: ["vaultProviderCommissions", normalizedIds],
    queryFn: () => fetchVaultProviderCommissions(normalizedIds),
    enabled: normalizedIds.length > 0,
    staleTime: STALE_TIME_MS,
    refetchOnWindowFocus: false,
    retry: 1,
  });

  return {
    commissionsById: data ?? EMPTY_COMMISSIONS,
    loading: normalizedIds.length > 0 && isLoading,
  };
}
