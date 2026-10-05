/**
 * ActivityListWithRefund — the v3 activity feed, plus the expired deposit's
 * HTLC refund or, once the PegIn has swept it, its redeem. An expired deposit
 * whose row would carry one of those actions, but which the feed has no row
 * for, gets one here so the action has a row to sit on.
 *
 * Split out of the page so it is the v3 branch alone that mounts the deposit
 * lifecycle: `usePendingDeposits`, the protocol params and the refund modals.
 * v2 renders ActivityList directly and keeps its original behaviour — a
 * refundable-expired deposit still reads "Pending" there, and none of this
 * scaffolding is instantiated.
 *
 * Peg-in polling is NOT mounted here: `AppPeginPollingProvider` sits above
 * `<Outlet>` in RootLayout, so this subtree already has it. A second mount
 * would fork the polling and optimistic-completion state.
 */

import { useCallback, useMemo } from "react";

import { PendingDepositModals } from "@/components/simple/PendingDepositModals";
import { usePeginPolling } from "@/context/deposit/PeginPollingContext";
import { ProtocolParamsProvider } from "@/context/ProtocolParamsContext";
import { isClaimExpiredRowActionAvailable } from "@/hooks/deposit/useClaimExpiredRowAction";
import { getRefundRowAction } from "@/hooks/deposit/useRefundRowAction";
import { usePendingDeposits } from "@/hooks/usePendingDeposits";
import { usePrices } from "@/hooks/usePrices";
import { withExpiredDepositRows } from "@/services/activity/expiredDepositRows";
import type { ActivityRow } from "@/types/activityLog";
import type { DepositPollingResult } from "@/types/peginPolling";

import { ActivityList } from "./ActivityList";

/**
 * Whether an expired deposit's row would carry an action — its redeem, or its
 * refund (available, or blocked with an explanation). It asks the same two
 * decisions `ExpiredWithdrawButton` renders from, so a synthetic row always
 * has a control. Only such a deposit gets one: a refunded, never-broadcast or
 * closed-window deposit has nothing to offer, and a bare "Deposit" row for it
 * would read as a successful deposit.
 */
function carriesExpiredAction(result: DepositPollingResult | undefined) {
  if (isClaimExpiredRowActionAvailable(result)) return true;
  const refund = getRefundRowAction(result);
  return refund.available || refund.blockedTooltip !== null;
}

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
    ethAddress,
    broadcastModal,
    refundModal,
    reclaimModal,
    emergencyWithdrawModal,
    claimExpiredModal,
  } = usePendingDeposits();
  const { getPollingResult } = usePeginPolling();

  // Current prices for the rows' USD sub-lines. A row whose symbol has no price
  // renders no sub-line.
  const { prices } = usePrices();

  // Deposits that expired before activation and have not been reclaimed yet,
  // keyed by vault id. Correlate these against a row's `vaultId` and never its
  // `id`: an indexed row's id is its event, not its vault (see ActivityLog).
  const refundableVaultIds = useMemo(
    () => new Set<string>(expiredActivities.map((a) => a.id)),
    [expiredActivities],
  );

  // Expired deposits that get a synthetic row: only while connected — the
  // disconnected feed shows its own empty state — and only when that row
  // would carry an action.
  const expiredWithAction = useMemo(
    () =>
      isConnected
        ? expiredActivities.filter((activity) =>
            carriesExpiredAction(getPollingResult(activity.id)),
          )
        : [],
    [isConnected, expiredActivities, getPollingResult],
  );

  const rows = useMemo<ActivityRow[]>(
    () =>
      withExpiredDepositRows(
        activities.map((row) =>
          row.kind === "row" &&
          row.vaultId &&
          refundableVaultIds.has(row.vaultId)
            ? { ...row, isPending: false }
            : row,
        ),
        expiredWithAction,
      ),
    [activities, refundableVaultIds, expiredWithAction],
  );

  const handleWithdraw = useCallback(
    (vaultId: string) => refundModal.handleRefundClick(vaultId),
    [refundModal],
  );
  const handleRedeem = useCallback(
    (vaultId: string) => claimExpiredModal.handleClaimClick(vaultId),
    [claimExpiredModal],
  );

  const list = (
    <ActivityList
      activities={rows}
      isConnected={isConnected}
      prices={prices}
      refundableVaultIds={refundableVaultIds}
      onWithdraw={handleWithdraw}
      onRedeem={handleRedeem}
    />
  );

  // No refund to offer: render the feed bare. ProtocolParamsProvider below
  // BLOCKS its children until the contract params resolve, so mounting it
  // unconditionally would hold the whole feed — including the disconnected
  // empty state — behind a network read the feed does not need.
  //
  // An open redeem modal keeps the subtree mounted: a successful redeem moves
  // the vault out of the expired list before the depositor acknowledges the
  // success screen, and unmounting here would drop that screen.
  if (refundableVaultIds.size === 0 && !claimExpiredModal.claimingActivity) {
    return list;
  }

  return (
    <ProtocolParamsProvider>
      {list}
      <PendingDepositModals
        broadcastModal={broadcastModal}
        refundModal={refundModal}
        reclaimModal={reclaimModal}
        emergencyWithdrawModal={emergencyWithdrawModal}
        claimExpiredModal={claimExpiredModal}
        ethAddress={ethAddress}
      />
    </ProtocolParamsProvider>
  );
}
