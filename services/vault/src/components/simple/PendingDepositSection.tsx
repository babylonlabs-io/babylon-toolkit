/**
 * PendingDepositSection Component
 *
 * Displays pending deposits as a single expandable summary card.
 * Follows the same pattern as CollateralSection:
 *  - Title row with count and spinner
 *  - Single Card with total BTC amount + ExpandMenuButton
 *  - When expanded, shows individual deposit sub-cards
 */

import { Avatar, Card } from "@babylonlabs-io/core-ui";
import { useMemo, useState } from "react";

import { ArtifactDownloadModal } from "@/components/deposit/ArtifactDownloadModal";
import { ExpandMenuButton } from "@/components/shared";
import {
  CARD_DARK_BG_CLASS,
  SUMMARY_CARD_CLASS,
} from "@/components/shared/layoutClasses";
import { getNetworkConfigBTC } from "@/config";
import { PeginPollingProvider } from "@/context/deposit/PeginPollingContext";
import { usePendingDeposits } from "@/hooks/usePendingDeposits";
import { groupActivitiesByBatch } from "@/utils/batchedPegin";
import { formatBtcAmount } from "@/utils/formatting";

import { BatchedDepositGroup } from "./BatchedDepositGroup";
import { ExpiredDepositSection } from "./ExpiredDepositSection";
import { PendingDepositActionBadge } from "./PendingDepositActionBadge";
import { PendingDepositCard } from "./PendingDepositCard";
import { PendingDepositModals } from "./PendingDepositModals";

const btcConfig = getNetworkConfigBTC();

export function PendingDepositSection() {
  const [isExpanded, setIsExpanded] = useState(false);

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
    signModal,
    broadcastModal,
    wotsKeyModal,
    activationModal,
    artifactDownloadModal,
    refundModal,
  } = usePendingDeposits();

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

  if (!hasPendingDeposits && !hasExpiredDeposits) return null;

  const count = pendingActivities.length;

  return (
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
              <h2 className="text-[24px] font-normal text-accent-primary">
                Pending Deposits ({count})
              </h2>
              <div className="h-[18px] w-[18px] animate-spin rounded-full border-2 border-accent-primary border-t-transparent" />
            </div>

            {/* Summary card */}
            <Card
              variant="filled"
              className={`${SUMMARY_CARD_CLASS} ${CARD_DARK_BG_CLASS}`}
            >
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
              {isExpanded && (
                <div className="mt-4 max-h-[400px] space-y-2 overflow-y-auto">
                  {pendingGroups.map((group) =>
                    group.length > 1 ? (
                      <BatchedDepositGroup
                        key={group[0].id}
                        activities={group}
                        vaultProviders={vaultProviders}
                        onSignClick={signModal.handleSignClick}
                        onBroadcastClick={broadcastModal.handleBroadcastClick}
                        onWotsKeyClick={wotsKeyModal.handleWotsKeyClick}
                        onActivationClick={
                          activationModal.handleActivationClick
                        }
                        onRefundClick={refundModal.handleRefundClick}
                        onArtifactDownloadClick={
                          artifactDownloadModal.handleArtifactDownloadClick
                        }
                      />
                    ) : (
                      <PendingDepositCard
                        key={group[0].id}
                        depositId={group[0].id}
                        amount={group[0].collateral.amount}
                        timestamp={group[0].timestamp}
                        txHash={group[0].peginTxHash}
                        providerId={group[0].providers[0].id}
                        vaultProviders={vaultProviders}
                        onSignClick={signModal.handleSignClick}
                        onBroadcastClick={broadcastModal.handleBroadcastClick}
                        onWotsKeyClick={wotsKeyModal.handleWotsKeyClick}
                        onActivationClick={
                          activationModal.handleActivationClick
                        }
                        onRefundClick={refundModal.handleRefundClick}
                        onArtifactDownloadClick={
                          artifactDownloadModal.handleArtifactDownloadClick
                        }
                      />
                    ),
                  )}
                </div>
              )}
            </Card>
          </div>
        )}

        <ExpiredDepositSection
          expiredActivities={expiredActivities}
          vaultProviders={vaultProviders}
          onSignClick={signModal.handleSignClick}
          onBroadcastClick={broadcastModal.handleBroadcastClick}
          onWotsKeyClick={wotsKeyModal.handleWotsKeyClick}
          onActivationClick={activationModal.handleActivationClick}
          onRefundClick={refundModal.handleRefundClick}
          onArtifactDownloadClick={
            artifactDownloadModal.handleArtifactDownloadClick
          }
        />
      </div>

      {artifactDownloadModal.isOpen &&
        artifactDownloadModal.params &&
        artifactDownloadModal.activity && (
          <ArtifactDownloadModal
            open={artifactDownloadModal.isOpen}
            onClose={artifactDownloadModal.handleClose}
            onComplete={artifactDownloadModal.handleComplete}
            providerAddress={artifactDownloadModal.params.providerAddress}
            peginTxid={artifactDownloadModal.params.peginTxid}
            depositorPk={artifactDownloadModal.params.depositorPk}
            vaultId={artifactDownloadModal.activity.id}
            unsignedPrePeginTxHex={
              artifactDownloadModal.activity.unsignedPrePeginTx
            }
          />
        )}

      {/* Sign / Broadcast / WOTS Key / Activation / Refund / Success modals */}
      <PendingDepositModals
        signModal={signModal}
        broadcastModal={broadcastModal}
        wotsKeyModal={wotsKeyModal}
        activationModal={activationModal}
        refundModal={refundModal}
        vaultProviders={vaultProviders}
        btcPublicKey={btcPublicKey}
        ethAddress={ethAddress}
      />
    </PeginPollingProvider>
  );
}
