/**
 * Hook to fetch a single position by position ID
 * Used for displaying position details on the Market Detail page
 */

import { useCallback, useEffect, useState } from "react";
import type { Hex } from "viem";

import { CONTRACTS } from "../config/contracts";
import type { PositionWithMorpho } from "../services/position";
import { getSinglePositionWithMorpho } from "../services/position";

export interface UseSinglePositionResult {
  /** Position data with Morpho details */
  position: PositionWithMorpho | null;
  /** Loading state - true only on initial load, not during refetch */
  loading: boolean;
  /** Refetching state - true when refetching data after initial load */
  refetching: boolean;
  /** Error state */
  error: Error | null;
  /** Refetch position data */
  refetch: () => Promise<void>;
}

/**
 * Fetch a single position by position ID
 *
 * @param positionId - Position ID (hex string), undefined if not available
 * @returns Position data, loading state, error, and refetch function
 */
export function useSinglePosition(
  positionId: Hex | undefined,
): UseSinglePositionResult {
  const [position, setPosition] = useState<PositionWithMorpho | null>(null);
  const [loading, setLoading] = useState(true);
  const [refetching, setRefetching] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const fetchPosition = useCallback(
    async (isRefetch = false) => {
      if (!positionId) {
        setLoading(false);
        return;
      }

      try {
        if (isRefetch) {
          setRefetching(true);
        } else {
          setLoading(true);
        }
        setError(null);

        const positionData = await getSinglePositionWithMorpho(
          positionId,
          CONTRACTS.VAULT_CONTROLLER,
        );

        setPosition(positionData);
      } catch (err) {
        setError(
          err instanceof Error ? err : new Error("Failed to fetch position"),
        );
      } finally {
        if (isRefetch) {
          setRefetching(false);
        } else {
          setLoading(false);
        }
      }
    },
    [positionId],
  );

  useEffect(() => {
    fetchPosition(false);
  }, [fetchPosition]);

  const refetch = useCallback(async () => {
    await fetchPosition(true);
  }, [fetchPosition]);

  return {
    position,
    loading,
    refetching,
    error,
    refetch,
  };
}
