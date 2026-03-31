/**
 * usePendingDeposits hook
 *
 * Fetches vault deposits and filters to only pending ones (contractStatus 0, 1, or 7).
 * Provides polling infrastructure, wallet state, and modal handlers for
 * sign/broadcast/refund actions on pending and expired deposits.
 */

import { useMemo } from "react";
import type { Address } from "viem";

import { useBTCWallet, useETHWallet } from "@/context/wallet";
import { useActivationModal } from "@/hooks/deposit/useActivationModal";
import { useAllDepositProviders } from "@/hooks/deposit/useAllDepositProviders";
import { useArtifactDownloadModal } from "@/hooks/deposit/useArtifactDownloadModal";
import { useBroadcastModal } from "@/hooks/deposit/useBroadcastModal";
import { useLamportKeyModal } from "@/hooks/deposit/useLamportKeyModal";
import { usePayoutSignModal } from "@/hooks/deposit/usePayoutSignModal";
import { useRefundModal } from "@/hooks/deposit/useRefundModal";
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

  // Filter to pending deposits (0=PENDING, 1=VERIFIED) and refundable expired ones (7=EXPIRED).
  // Only EXPIRED vaults with unsignedPrePeginTx are included — without it the
  // refund PSBT cannot be built and the card would show with no actionable button.
  const pendingActivities = useMemo(
    () =>
      activities.filter(
        (a) =>
          a.contractStatus === ContractStatus.PENDING ||
          a.contractStatus === ContractStatus.VERIFIED ||
          (a.contractStatus === ContractStatus.EXPIRED && !!a.unsignedPrePeginTx),
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

  const lamportKeyModal = useLamportKeyModal({
    allActivities: activities,
    onSuccess: refetchActivities,
  });

  const activationModal = useActivationModal({
    allActivities: activities,
    onSuccess: refetchActivities,
  });

  const artifactDownloadModal = useArtifactDownloadModal({
    allActivities: activities,
    onSuccess: refetchActivities,
  });

  const refundModal = useRefundModal({
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
    lamportKeyModal,
    activationModal,
    artifactDownloadModal,
    refundModal,
  };
}
