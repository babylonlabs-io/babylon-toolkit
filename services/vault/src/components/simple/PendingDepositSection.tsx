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
import { getNetworkConfigBTC } from "@/config";
import { PeginPollingProvider } from "@/context/deposit/PeginPollingContext";
import { usePendingDeposits } from "@/hooks/usePendingDeposits";
import { formatBtcAmount } from "@/utils/formatting";

import { PendingDepositCard } from "./PendingDepositCard";
import { PendingDepositModals } from "./PendingDepositModals";

const btcConfig = getNetworkConfigBTC();

export function PendingDepositSection() {
  const [isExpanded, setIsExpanded] = useState(false);

  const {
    pendingActivities,
    allActivities,
    pendingPegins,
    vaultProviders,
    btcPublicKey,
    btcAddress,
    ethAddress,
    hasPendingDeposits,
    signModal,
    broadcastModal,
    lamportKeyModal,
    artifactDownloadModal,
  } = usePendingDeposits();

  const totalBtcAmount = useMemo(
    () =>
      pendingActivities.reduce(
        (sum, a) => sum + parseFloat(a.collateral.amount || "0"),
        0,
      ),
    [pendingActivities],
  );

  if (!hasPendingDeposits) return null;

  const count = pendingActivities.length;

  return (
    <PeginPollingProvider
      activities={allActivities}
      pendingPegins={pendingPegins}
      btcPublicKey={btcPublicKey}
      btcAddress={btcAddress}
      vaultProviders={vaultProviders}
    >
      <div className="w-full space-y-6">
        {/* Header row */}
        <div className="flex items-center gap-3">
          <h2 className="text-[24px] font-normal text-accent-primary">
            Pending Deposits ({count})
          </h2>
          <div className="h-[18px] w-[18px] animate-spin rounded-full border-2 border-accent-primary border-t-transparent" />
        </div>

        {/* Summary card */}
        <Card variant="filled" className="w-full">
          {/* Summary row: BTC icon + total amount + expand toggle */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Avatar
                url={btcConfig.icon}
                alt={btcConfig.coinSymbol}
                size="small"
              />
              <span className="text-base text-accent-primary">
                {formatBtcAmount(totalBtcAmount)}
              </span>
            </div>
            <ExpandMenuButton
              isExpanded={isExpanded}
              onToggle={() => setIsExpanded((prev) => !prev)}
              aria-label="Pending deposit details"
            />
          </div>

          {/* Expanded deposit list */}
          {isExpanded && (
            <div className="mt-4 max-h-[400px] space-y-3 overflow-y-auto">
              {pendingActivities.map((activity) => (
                <PendingDepositCard
                  key={activity.id}
                  depositId={activity.id}
                  amount={activity.collateral.amount}
                  timestamp={activity.timestamp}
                  txHash={activity.txHash ?? activity.id}
                  providerId={activity.providers[0].id}
                  vaultProviders={vaultProviders}
                  onSignClick={signModal.handleSignClick}
                  onBroadcastClick={broadcastModal.handleBroadcastClick}
                  onLamportKeyClick={lamportKeyModal.handleLamportKeyClick}
                  onArtifactDownloadClick={
                    artifactDownloadModal.handleArtifactDownloadClick
                  }
                />
              ))}
            </div>
          )}
        </Card>
      </div>

      {artifactDownloadModal.isOpen && artifactDownloadModal.params && (
        <ArtifactDownloadModal
          open={artifactDownloadModal.isOpen}
          onClose={artifactDownloadModal.handleClose}
          onComplete={artifactDownloadModal.handleComplete}
          providerUrl={artifactDownloadModal.params.providerUrl}
          peginTxid={artifactDownloadModal.params.peginTxid}
          depositorPk={artifactDownloadModal.params.depositorPk}
        />
      )}

      {/* Sign / Broadcast / Lamport Key / Success modals */}
      <PendingDepositModals
        signModal={signModal}
        broadcastModal={broadcastModal}
        lamportKeyModal={lamportKeyModal}
        vaultProviders={vaultProviders}
        btcPublicKey={btcPublicKey}
        ethAddress={ethAddress}
      />
    </PeginPollingProvider>
  );
}
