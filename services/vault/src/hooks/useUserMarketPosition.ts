/**
 * Hook for fetching user's position in a specific market
 * This provides more accurate position data for a specific market
 */

import { useQuery } from "@tanstack/react-query";
import { useETHWallet } from "@babylonlabs-io/wallet-connector";
import type { Address } from "viem";

import { Morpho } from "../clients/eth-contract";
import type { MorphoUserPosition } from "../clients/eth-contract";

/**
 * Result interface for useUserMarketPosition hook
 */
export interface UseUserMarketPositionResult {
    /** User's position in the market */
    position: MorphoUserPosition | null;
    /** Loading state - true while fetching data */
    loading: boolean;
    /** Error state - contains error if fetch failed */
    error: Error | null;
    /** Function to manually refetch data */
    refetch: () => Promise<void>;
}

/**
 * Custom hook to fetch user's position in a specific market
 *
 * @param marketId - Market ID to fetch position for
 * @param proxyAddress - User's proxy contract address (optional, will use wallet address if not provided)
 * @returns Object containing position data, loading state, error state, and refetch function
 */
export function useUserMarketPosition(
    marketId: string | undefined,
    proxyAddress?: Address
): UseUserMarketPositionResult {
    const { address } = useETHWallet();

    const {
        data: position,
        isLoading,
        error,
        refetch
    } = useQuery<MorphoUserPosition | null>({
        queryKey: ["userMarketPosition", marketId, proxyAddress || address],
        queryFn: async () => {
            if (!marketId || (!proxyAddress && !address)) return null;

            // Use provided proxy address or fall back to wallet address
            const userProxyAddress = proxyAddress || (address as Address);

            return await Morpho.getUserPosition(marketId, userProxyAddress);
        },
        enabled: !!marketId && (!!proxyAddress || !!address),
        retry: 2,
        staleTime: 30000, // 30 seconds
    });

    // Wrap refetch to return Promise<void>
    const wrappedRefetch = async () => {
        await refetch();
    };

    return {
        position: position ?? null,
        loading: isLoading,
        error: error as Error | null,
        refetch: wrappedRefetch,
    };
}
