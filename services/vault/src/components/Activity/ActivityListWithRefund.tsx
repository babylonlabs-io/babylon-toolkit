/**
 * ActivityListWithRefund — the v3 activity feed, plus the expired deposit's
 * HTLC refund.
 *
 * Split out of the page so it is the v3 branch alone that mounts the deposit
 * lifecycle: `usePendingDeposits`, the polling providers and the refund
 * modals. v2 renders ActivityList directly and keeps its original behaviour —
 * a refundable-expired deposit still reads "Pending" there, and none of this
 * scaffolding is instantiated.
 */

import { useCallback, useMemo } from "react";

import { PendingDepositModals } from "@/components/simple/PendingDepositModals";
import { ProtocolParamsProvider } from "@/context/ProtocolParamsContext";
import { PeginPollingProvider } from "@/context/deposit/PeginPollingContext";
import { usePendingDeposits } from "@/hooks/usePendingDeposits";
import type { ActivityRow } from "@/types/activityLog";

import { ActivityList } from "./ActivityList";

interface ActivityListWithRefundProps {
  activities: ActivityRow[];
  isConnected: boolean;
}

export function ActivityListWithRefund({
  activities,
  isConnected,
}: ActivityListWithRefundProps) {
  const {
    expiredActivities,
    allActivities,
    pendingPegins,
    btcPublicKey,
    ethAddress,
    broadcastModal,
    refundModal,
    emergencyWithdrawModal,
  } = usePendingDeposits();

  // Deposits that expired before activation and have not been reclaimed yet,
  // keyed by vault id. Correlate these against a row's `vaultId` and never its
  // `id`: an indexed row's id is its event, not its vault (see ActivityLog).
  const refundableVaultIds = useMemo(
    () => new Set<string>(expiredActivities.map((a) => a.id)),
    [expiredActivities],
  );

  // Such a row arrives from localStorage still marked pending; the contract
  // status says otherwise, so correct it before it reaches the status column.
  const rows = useMemo<ActivityRow[]>(
    () =>
      activities.map((row) =>
        row.kind === "row" && row.vaultId && refundableVaultIds.has(row.vaultId)
          ? { ...row, isPending: false, isExpired: true }
          : row,
      ),
    [activities, refundableVaultIds],
  );

  const handleWithdraw = useCallback(
    (vaultId: string) => refundModal.handleRefundClick(vaultId),
    [refundModal],
  );

  const list = (
    <ActivityList
      activities={rows}
      isConnected={isConnected}
      refundableVaultIds={refundableVaultIds}
      onWithdraw={handleWithdraw}
    />
  );

  // No refund to offer: render the feed bare. ProtocolParamsProvider below
  // BLOCKS its children until the contract params resolve, so mounting it
  // unconditionally would hold the whole feed — including the disconnected
  // empty state — behind a network read the feed does not need.
  if (refundableVaultIds.size === 0) return list;

  return (
    <ProtocolParamsProvider>
      <PeginPollingProvider
        activities={allActivities}
        pendingPegins={pendingPegins}
        btcPublicKey={btcPublicKey}
      >
        {list}
        <PendingDepositModals
          broadcastModal={broadcastModal}
          refundModal={refundModal}
          emergencyWithdrawModal={emergencyWithdrawModal}
          ethAddress={ethAddress}
        />
      </PeginPollingProvider>
    </ProtocolParamsProvider>
  );
}
