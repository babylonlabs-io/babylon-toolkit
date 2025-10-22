import type { Hex } from "viem";
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

  const {
    allActivities,
    pendingPegins,
    addPendingPegin,
    updatePendingPeginStatus,
  } = usePeginStorage({
    ethAddress: connectedAddress || '',
    confirmedPegins: confirmedActivities,
  });

  return {
    activities: allActivities,
    pendingPegins,
    refetchActivities: refetch,
    addPendingPegin,
    updatePendingPeginStatus,
  };
}
