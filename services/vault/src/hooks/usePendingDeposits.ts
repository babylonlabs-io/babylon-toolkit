/**
 * usePendingDeposits hook
 *
 * Fetches vault deposits and filters to only pending ones (contractStatus 0 or 1).
 * Provides polling infrastructure, wallet state, and modal handlers for
 * sign/broadcast actions on pending deposits.
 */

import { useMemo } from "react";
import type { Address } from "viem";

import { useBTCWallet, useETHWallet } from "@/context/wallet";
import { useAllDepositProviders } from "@/hooks/deposit/useAllDepositProviders";
import { useBroadcastModal } from "@/hooks/deposit/useBroadcastModal";
import { usePayoutSignModal } from "@/hooks/deposit/usePayoutSignModal";
import { useBtcPublicKey } from "@/hooks/useBtcPublicKey";
import { useVaultDeposits } from "@/hooks/useVaultDeposits";
import { ContractStatus } from "@/models/peginStateMachine";

export function usePendingDeposits() {
  const { connected: btcConnected, address: btcAddress } = useBTCWallet();
  const { address: ethAddress } = useETHWallet();
  const btcPublicKey = useBtcPublicKey(btcConnected);

  const { activities, pendingPegins, refetchActivities } = useVaultDeposits(
    ethAddress as Address | undefined,
  );

  const { vaultProviders } = useAllDepositProviders(activities);

  // Filter to only pending deposits (contract status 0=PENDING or 1=VERIFIED)
  const pendingActivities = useMemo(
    () =>
      activities.filter(
        (a) =>
          a.contractStatus === ContractStatus.PENDING ||
          a.contractStatus === ContractStatus.VERIFIED,
      ),
    [activities],
  );

  const signModal = usePayoutSignModal({
    allActivities: activities,
    onSuccess: refetchActivities,
  });

  const broadcastModal = useBroadcastModal({
    allActivities: activities,
    onSuccess: refetchActivities,
  });

  return {
    pendingActivities,
    allActivities: activities,
    pendingPegins,
    vaultProviders,
    btcPublicKey,
    btcAddress,
    btcConnected,
    ethAddress,
    hasPendingDeposits: btcConnected && pendingActivities.length > 0,
    refetchActivities,
    signModal,
    broadcastModal,
  };
}
