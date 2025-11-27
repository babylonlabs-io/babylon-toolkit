import type { Hex } from "viem";

import { usePeginStorage } from "../storage/usePeginStorage";

import { usePeginRequests } from "./deposit/usePeginRequests";

/**
 * Hook to manage vault deposits data fetching
 * Only responsible for data - UI modal states and action handlers are managed by parent components
 * Wallet connections are managed by parent components
 */
export function useVaultDeposits(connectedAddress: Hex | undefined) {
  const { activities: confirmedActivities, refetch } = usePeginRequests({
    connectedAddress,
  });

  const { allActivities, pendingPegins, addPendingPegin } = usePeginStorage({
    ethAddress: connectedAddress || "",
    confirmedPegins: confirmedActivities,
  });

  return {
    activities: allActivities,
    pendingPegins,
    refetchActivities: refetch,
    addPendingPegin,
  };
}
