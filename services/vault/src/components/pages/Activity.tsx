import { Container, Loader } from "@babylonlabs-io/core-ui";
import { useCallback, useMemo } from "react";
import type { Hex } from "viem";

import { PendingDepositModals } from "@/components/simple/PendingDepositModals";
import { ProtocolParamsProvider } from "@/context/ProtocolParamsContext";
import { PeginPollingProvider } from "@/context/deposit/PeginPollingContext";
import { usePendingDeposits } from "@/hooks/usePendingDeposits";
import type { ActivityRow } from "@/types/activityLog";

import { useConnection, useETHWallet } from "../../context/wallet";
import { useActivitiesWithPending } from "../../hooks/useActivitiesWithPending";
import { ActivityList } from "../Activity";
import { PAGE_CONTENT_CLASS } from "../shared/layoutClasses";

export default function Activity() {
  const { address } = useETHWallet();
  const { isConnected } = useConnection();
  // God-mode demo rows are merged in by this hook (dev only), so the feed can
  // be exercised without a wallet or an indexed history. The panel itself is
  // mounted once by the route (see dev/GodModeMount), not per page.
  const { data: activities, isLoading } = useActivitiesWithPending(
    isConnected ? (address as Hex) : undefined,
  );

  // The deposit lifecycle the Vaults page owns, reused here so an expired
  // deposit's row can offer the same HTLC refund instead of sending the
  // depositor to another page for it.
  const deposits = usePendingDeposits();
  const {
    expiredActivities,
    allActivities,
    pendingPegins,
    btcPublicKey,
    ethAddress,
    broadcastModal,
    refundModal,
  } = deposits;

  // Expired deposits are keyed by vault id, the same id the localStorage-backed
  // pending rows carry — so a row in this set is a deposit that expired before
  // activation and has not been reclaimed yet.
  const refundableDepositIds = useMemo(
    () => new Set<string>(expiredActivities.map((a) => a.id)),
    [expiredActivities],
  );

  // Such a row arrives from localStorage still marked pending; the contract
  // status says otherwise, so correct it before it reaches the status column.
  const rows = useMemo<ActivityRow[]>(
    () =>
      (activities ?? []).map((row) =>
        row.kind === "row" && refundableDepositIds.has(row.id)
          ? { ...row, isPending: false, isExpired: true }
          : row,
      ),
    [activities, refundableDepositIds],
  );

  const handleWithdraw = useCallback(
    (depositId: string) => refundModal.handleRefundClick(depositId),
    [refundModal],
  );

  const list = (
    <ActivityList
      activities={rows}
      isConnected={isConnected}
      refundableDepositIds={refundableDepositIds}
      onWithdraw={handleWithdraw}
    />
  );

  return (
    <Container
      as="main"
      className={`${PAGE_CONTENT_CLASS} flex flex-1 flex-col gap-6 pb-6 max-md:flex-none max-md:gap-4 max-md:pb-4 max-md:pt-0`}
    >
      <div className="w-full">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader />
          </div>
        ) : refundableDepositIds.size === 0 ? (
          // No refund to offer: render the feed bare. ProtocolParamsProvider
          // below BLOCKS its children until the contract params resolve, so
          // wrapping it around the list unconditionally would hold the whole
          // page — including the disconnected empty state — behind a network
          // read the feed does not need.
          list
        ) : (
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
                ethAddress={ethAddress}
              />
            </PeginPollingProvider>
          </ProtocolParamsProvider>
        )}
      </div>
    </Container>
  );
}
