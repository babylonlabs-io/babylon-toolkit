/**
 * PendingDepositSection Component
 *
 * Displays pending deposits as a single expandable summary card.
 * Follows the same pattern as CollateralSection:
 *  - Title row with count and spinner
 *  - Single Card with total BTC amount + ExpandMenuButton
 *  - When expanded, shows individual deposit sub-cards
 */

import {
  Avatar,
  Card,
  FullScreenDialog,
  Heading,
} from "@babylonlabs-io/core-ui";
import { useCallback, useMemo, useState } from "react";
import type { Address, Hex } from "viem";

import { ExpandablePanel, ExpandMenuButton } from "@/components/shared";
import { SUMMARY_CARD_CLASS } from "@/components/shared/layoutClasses";
import { getNetworkConfigBTC } from "@/config";
import { PeginPollingProvider } from "@/context/deposit/PeginPollingContext";
import { ProtocolParamsProvider } from "@/context/ProtocolParamsContext";
import { usePendingDeposits } from "@/hooks/usePendingDeposits";
import { getBatchSiblings, groupActivitiesByBatch } from "@/utils/batchedPegin";
import { formatBtcAmount } from "@/utils/formatting";

import { BatchedDepositGroup } from "./BatchedDepositGroup";
import { ExpiredDepositSection } from "./ExpiredDepositSection";
import { PendingDepositActionBadge } from "./PendingDepositActionBadge";
import { PendingDepositCard } from "./PendingDepositCard";
import { PendingDepositModals } from "./PendingDepositModals";
import { PostDepositContinuationContent } from "./PostDepositContinuationContent";

const btcConfig = getNetworkConfigBTC();

export function PendingDepositSection() {
  const [isExpanded, setIsExpanded] = useState(false);
  // Vault IDs whose multistepper view modal is currently open. Holds the full
  // batch (for a split-pegin deposit) so the modal can render the multi-column
  // split layout; null when the modal is closed.
  const [viewingBatch, setViewingBatch] = useState<Hex[] | null>(null);

  const {
    pendingActivities,
    expiredActivities,
    allActivities,
    pendingPegins,
    vaultProviders,
    btcPublicKey,
    ethAddress,
    hasPendingDeposits,
    hasExpiredDeposits,
    broadcastModal,
    refundModal,
  } = usePendingDeposits();

  // Display-only summary total (rendered via formatBtcAmount, 8 dp). Never
  // reuse this parseFloat-sum for commitment / fee / split-sizing math — those
  // paths must sum satoshis as integers/bigints.
  const totalBtcAmount = useMemo(
    () =>
      pendingActivities.reduce(
        (sum, a) => sum + parseFloat(a.collateral.amount || "0"),
        0,
      ),
    [pendingActivities],
  );

  // Vaults sharing one Pre-PegIn transaction (a batched pegin) render
  // together so the shared broadcast is a single batch-level action.
  const pendingGroups = useMemo(
    () => groupActivitiesByBatch(pendingActivities),
    [pendingActivities],
  );

  // Clicking the card body (not an inner button or link) opens the deposit
  // multistepper view for the whole batch the card belongs to. The batch is
  // resolved fresh per click so the modal always reflects the current shape.
  const handleCardClick = useCallback(
    (depositId: string) => {
      const activity = allActivities.find((a) => a.id === depositId);
      if (!activity) return;
      const siblings = getBatchSiblings(allActivities, activity);
      setViewingBatch(siblings.map((s) => s.id as Hex));
    },
    [allActivities],
  );

  const handleViewingClose = useCallback(() => setViewingBatch(null), []);

  // A resume modal is rendered inside this section (under its
  // PeginPollingProvider). When the last pending deposit advances to a terminal
  // contract state (e.g. activation confirmed → ACTIVE), it drops out of
  // `pendingActivities`; without this guard the section — and the open modal —
  // would unmount before the modal could show its success terminal. Keep it
  // mounted while any action modal is open so the modal owns its own dismissal.
  const hasOpenModal = Boolean(
    broadcastModal.broadcastingActivity ||
      broadcastModal.successOpen ||
      refundModal.refundingActivity ||
      viewingBatch,
  );

  if (!hasPendingDeposits && !hasExpiredDeposits && !hasOpenModal) return null;

  const count = pendingActivities.length;

  // `PeginPollingProvider` resolves per-deposit `minPrepeginDepth` via
  // `useProtocolParamsContext` to tell a Bitcoin-confirmation wait apart from
  // a VP-ingestion wait on the confirming-deposit step — the dashboard doesn't
  // otherwise mount `ProtocolParamsProvider`, so do it here. Only fires when
  // there is something pending (the section early-returns above), so we don't
  // pay the params load on an empty dashboard.
  return (
    <ProtocolParamsProvider>
      <PeginPollingProvider
        activities={allActivities}
        pendingPegins={pendingPegins}
        btcPublicKey={btcPublicKey}
      >
        <div className="w-full space-y-10">
          {hasPendingDeposits && (
            <div className="space-y-6">
              {/* Header row */}
              <div className="flex items-center gap-3">
                <Heading
                  variant="h5"
                  as="h2"
                  className="font-normal text-accent-primary"
                >
                  Pending Deposits ({count})
                </Heading>
                <div className="h-[18px] w-[18px] animate-spin rounded-full border-2 border-accent-primary border-t-transparent" />
              </div>

              {/* Summary card */}
              <Card variant="filled" className={SUMMARY_CARD_CLASS}>
                {/* Summary row: BTC icon + amount | action badge (when collapsed) + expand toggle */}
                <div className="flex items-center justify-between gap-2">
                  <div className="flex min-w-0 flex-1 items-center gap-2">
                    <Avatar
                      url={btcConfig.icon}
                      alt={btcConfig.coinSymbol}
                      size="medium"
                    />
                    <span className="text-xl text-accent-primary">
                      {formatBtcAmount(totalBtcAmount)}
                    </span>
                  </div>
                  <div className="flex flex-shrink-0 items-center gap-2">
                    <PendingDepositActionBadge
                      pendingActivityIds={pendingActivities.map((a) => a.id)}
                      isExpanded={isExpanded}
                    />
                    <ExpandMenuButton
                      isExpanded={isExpanded}
                      onToggle={() => setIsExpanded((prev) => !prev)}
                      aria-label="Pending deposit details"
                    />
                  </div>
                </div>

                {/* Expanded deposit list */}
                <ExpandablePanel expanded={isExpanded}>
                  <div className="mt-4 max-h-[400px] space-y-2 overflow-y-auto">
                    {pendingGroups.map((group) =>
                      group.length > 1 ? (
                        <BatchedDepositGroup
                          key={group[0].id}
                          activities={group}
                          vaultProviders={vaultProviders}
                          onBroadcastClick={broadcastModal.handleBroadcastClick}
                          onGroupClick={handleCardClick}
                        />
                      ) : (
                        <PendingDepositCard
                          key={group[0].id}
                          depositId={group[0].id}
                          amount={group[0].collateral.amount}
                          timestamp={group[0].timestamp}
                          peginTxHash={group[0].peginTxHash}
                          prePeginTxHash={group[0].prePeginTxHash}
                          providerId={group[0].providers[0].id}
                          vaultProviders={vaultProviders}
                          onCardClick={handleCardClick}
                        />
                      ),
                    )}
                  </div>
                </ExpandablePanel>
              </Card>
            </div>
          )}

          <ExpiredDepositSection
            expiredActivities={expiredActivities}
            vaultProviders={vaultProviders}
            onRefundClick={refundModal.handleRefundClick}
          />
        </div>

        {/* Broadcast / Refund / Success modals. Every other per-vault action
            is owned by the deposit multistepper opened from the card body. */}
        <PendingDepositModals
          broadcastModal={broadcastModal}
          refundModal={refundModal}
          ethAddress={ethAddress}
        />

        {/* Multistepper view — opened by clicking a pending deposit card. */}
        {viewingBatch && ethAddress && (
          <FullScreenDialog
            open
            onClose={handleViewingClose}
            className="items-center justify-center p-6"
          >
            <div className="mx-auto w-full max-w-[520px]">
              <PostDepositContinuationContent
                vaultIds={viewingBatch}
                depositorEthAddress={ethAddress as Address}
                onClose={handleViewingClose}
              />
            </div>
          </FullScreenDialog>
        )}
      </PeginPollingProvider>
    </ProtocolParamsProvider>
  );
}
