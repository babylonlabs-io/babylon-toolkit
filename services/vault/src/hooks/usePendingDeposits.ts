/**
 * usePendingDeposits hook
 *
 * Fetches vault deposits and splits them into two lists:
 *  - pendingActivities: in-flight deposits (contractStatus 0=PENDING or 1=VERIFIED).
 *  - expiredActivities: refundable expired deposits (contractStatus 7=EXPIRED with
 *    unsignedPrePeginTx — the only indexer-sourced field required to build the
 *    refund PSBT; hashlock and htlcVout come from the on-chain contract).
 * Provides polling infrastructure, wallet state, and modal handlers for
 * broadcast/refund actions on pending and expired deposits. The post-broadcast
 * actions (WOTS, payout signing, activation, artifact download) are owned by
 * the deposit multistepper opened from the card body, not per-action modals.
 */

import { useMemo } from "react";
import type { Address } from "viem";

import { useBTCWallet, useETHWallet } from "@/context/wallet";
import { useAllDepositProviders } from "@/hooks/deposit/useAllDepositProviders";
import { useBroadcastModal } from "@/hooks/deposit/useBroadcastModal";
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

  const pendingActivities = useMemo(
    () =>
      activities.filter(
        (a) =>
          a.contractStatus === ContractStatus.PENDING ||
          a.contractStatus === ContractStatus.VERIFIED,
      ),
    [activities],
  );

  const expiredActivities = useMemo(
    () =>
      activities.filter(
        (a) =>
          a.contractStatus === ContractStatus.EXPIRED && !!a.unsignedPrePeginTx,
      ),
    [activities],
  );

  const broadcastModal = useBroadcastModal({
    allActivities: activities,
    onSuccess: refetchActivities,
  });

  const refundModal = useRefundModal({
    allActivities: activities,
    onSuccess: refetchActivities,
  });

  return {
    pendingActivities,
    expiredActivities,
    allActivities: activities,
    pendingPegins,
    vaultProviders,
    btcPublicKey,
    btcAddress,
    btcConnected,
    ethAddress,
    hasPendingDeposits: btcConnected && pendingActivities.length > 0,
    hasExpiredDeposits: btcConnected && expiredActivities.length > 0,
    refetchActivities,
    broadcastModal,
    refundModal,
  };
}
