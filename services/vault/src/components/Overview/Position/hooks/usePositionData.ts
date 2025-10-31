/**
 * Hook for fetching and transforming position data
 */

import { useMemo } from "react";
import type { Address } from "viem";

import { useETHWallet } from "../../../../context/wallet";
import { useUserPositions } from "../../../../hooks/useUserPositions";
import type { Position } from "../../../../types/position";
import { transformPosition } from "../utils/positionTransformer";

export interface UsePositionDataResult {
  /** Transformed positions ready for UI display */
  positions: Position[];
  /** Loading state */
  loading: boolean;
  /** Error state */
  error: Error | null;
  /** Connected ETH address */
  ethAddress: string | undefined;
}

/**
 * Fetch user positions and transform them for UI display
 *
 * @returns Position data, loading state, and error state
 */
export function usePositionData(): UsePositionDataResult {
  const { address: ethAddress } = useETHWallet();

  // Fetch user positions from service
  const {
    positions: userPositions,
    loading,
    error,
  } = useUserPositions(ethAddress as Address | undefined);

  // Transform positions to UI format
  const positions = useMemo(
    () => userPositions.map(transformPosition),
    [userPositions],
  );

  return {
    positions,
    loading,
    error,
    ethAddress,
  };
}
