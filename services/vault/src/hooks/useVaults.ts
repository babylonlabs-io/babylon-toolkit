/**
 * Hook for fetching vaults from the Vault Indexer API
 */

import { useQuery } from "@tanstack/react-query";

import { VaultApiClient } from "../clients/vault-api";
import { getVaultApiUrl } from "../clients/vault-api/config";
import type { Vault } from "../clients/vault-api/types";

/**
 * Result interface for useVaults hook
 */
export interface UseVaultsResult {
    /** Array of vaults from API */
    vaults: Vault[];
    /** Loading state - true while fetching data */
    loading: boolean;
    /** Error state - contains error if fetch failed */
    error: Error | null;
    /** Function to manually refetch data */
    refetch: () => Promise<void>;
}

/**
 * Custom hook to fetch vaults from the Vault Indexer API
 *
 * @returns Object containing vaults array, loading state, error state, and refetch function
 */
export function useVaults(): UseVaultsResult {
    // Use React Query to fetch data from API
    const { data, isLoading, error, refetch } = useQuery({
        queryKey: ["vaults"],
        queryFn: async () => {
            // Note: The API doesn't have a "get all vaults" endpoint, so we'll need to implement
            // a different approach. For now, this is a placeholder.
            throw new Error("No endpoint to fetch all vaults - use individual vault queries instead");
        },
        retry: 2,
        staleTime: 60000, // 1 minute
        enabled: false, // Disabled by default since there's no "get all" endpoint
    });

    // Wrap refetch to return Promise<void> for consistency
    const wrappedRefetch = async () => {
        await refetch();
    };

    return {
        vaults: data || [],
        loading: isLoading,
        error: error as Error | null,
        refetch: wrappedRefetch,
    };
}

/**
 * Hook for fetching a specific vault by ID
 */
export interface UseVaultResult {
    /** Vault data from API */
    vault: Vault | null;
    /** Loading state - true while fetching data */
    loading: boolean;
    /** Error state - contains error if fetch failed */
    error: Error | null;
    /** Function to manually refetch data */
    refetch: () => Promise<void>;
}

/**
 * Custom hook to fetch a specific vault by ID
 *
 * @param vaultId - Vault ID to fetch
 * @returns Object containing vault data, loading state, error state, and refetch function
 */
export function useVault(vaultId: string | undefined): UseVaultResult {
    // Use React Query to fetch data from API
    const { data, isLoading, error, refetch } = useQuery({
        queryKey: ["vault", vaultId],
        queryFn: async () => {
            if (!vaultId) throw new Error("Vault ID is required");
            const client = new VaultApiClient(getVaultApiUrl());
            return client.getVault(vaultId);
        },
        enabled: !!vaultId,
        retry: 2,
        staleTime: 60000, // 1 minute
    });

    // Wrap refetch to return Promise<void> for consistency
    const wrappedRefetch = async () => {
        await refetch();
    };

    return {
        vault: data || null,
        loading: isLoading,
        error: error as Error | null,
        refetch: wrappedRefetch,
    };
}
