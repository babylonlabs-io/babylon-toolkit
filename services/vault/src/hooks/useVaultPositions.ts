import type { Hex } from "viem";
import { useMemo } from "react";
import { usePeginRequests } from "./usePeginRequests";
import { usePeginStorage } from "../state/usePeginStorage";

/**
 * Hook to manage vault positions data fetching
 * Only responsible for data - UI modal states and action handlers are managed by parent components
 * Wallet connections are managed by parent components
 */
export function useVaultPositions(
  connectedAddress: Hex | undefined,
) {
  const { activities: confirmedActivities, refetch } = usePeginRequests({
    connectedAddress,
  });

  // Use ethAddress-based storage key
  const storageKey = connectedAddress || 'default';
  const {
    pendingPegins,
    addPendingPegin,
    updatePendingPeginStatus,
    updatePeginState,
  } = usePeginStorage(storageKey);

  // Merge confirmed activities with pending pegins
  const allActivities = useMemo(() => {
    // Combine both sources - confirmed from contract and pending from localStorage
    return [...confirmedActivities];
  }, [confirmedActivities]);

  return {
    activities: allActivities,
    pendingPegins,
    refetchActivities: refetch,
    addPendingPegin,
    updatePendingPeginStatus,
    updatePeginState,
  };
}
