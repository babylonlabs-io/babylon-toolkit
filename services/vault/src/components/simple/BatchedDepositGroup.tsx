/**
 * BatchedDepositGroup Component
 *
 * Handles the set of vaults funded by one shared Pre-PegIn Bitcoin
 * transaction (a batched pegin).
 *
 * While the shared Pre-PegIn still needs broadcasting, the vaults render
 * inside a grouped container with the broadcast button hoisted to the
 * group (one button for the batch) and suppressed on the inner cards.
 *
 * Once the broadcast is done the batch has no shared action left — every
 * remaining step (WOTS, sign, activate) is per-vault — so the grouping
 * chrome is dropped and the vaults render as standalone cards.
 */

import { Button } from "@babylonlabs-io/core-ui";

import {
  getActionStatus,
  PeginAction,
} from "@/components/deposit/actionStatus";
import { usePeginPolling } from "@/context/deposit/PeginPollingContext";
import { COPY } from "@/copy";
import type { VaultActivity } from "@/types/activity";
import type { VaultProvider } from "@/types/vaultProvider";

import { PendingDepositCard } from "./PendingDepositCard";

interface BatchedDepositGroupProps {
  /** Sibling vaults sharing one Pre-PegIn transaction (2 or more). */
  activities: VaultActivity[];
  vaultProviders: VaultProvider[];
  onSignClick: (depositId: string) => void;
  onBroadcastClick: (depositId: string) => void;
  onWotsKeyClick: (depositId: string) => void;
  onActivationClick: (depositId: string) => void;
  onRefundClick: (depositId: string) => void;
  onArtifactDownloadClick?: (depositId: string) => void;
}

export function BatchedDepositGroup({
  activities,
  vaultProviders,
  onSignClick,
  onBroadcastClick,
  onWotsKeyClick,
  onActivationClick,
  onRefundClick,
  onArtifactDownloadClick,
}: BatchedDepositGroupProps) {
  const { getPollingResult } = usePeginPolling();

  // A sibling still needs the shared Pre-PegIn broadcast. One broadcast
  // covers the whole batch, so clicking the hoisted button routes through
  // any pending sibling.
  const broadcastTarget = activities.find((activity) => {
    const result = getPollingResult(activity.id);
    if (!result) return false;
    const status = getActionStatus(result);
    return (
      status.type === "available" &&
      status.action.action === PeginAction.SIGN_AND_BROADCAST_TO_BITCOIN
    );
  });

  const renderCard = (activity: VaultActivity, suppressBroadcast: boolean) => (
    <PendingDepositCard
      key={activity.id}
      depositId={activity.id}
      amount={activity.collateral.amount}
      timestamp={activity.timestamp}
      txHash={activity.peginTxHash}
      providerId={activity.providers[0].id}
      vaultProviders={vaultProviders}
      suppressBroadcastAction={suppressBroadcast}
      onSignClick={onSignClick}
      onBroadcastClick={onBroadcastClick}
      onWotsKeyClick={onWotsKeyClick}
      onActivationClick={onActivationClick}
      onRefundClick={onRefundClick}
      onArtifactDownloadClick={onArtifactDownloadClick}
    />
  );

  // Broadcast done — no shared action remains. Render the vaults as
  // standalone cards, same as any non-batched deposit.
  if (!broadcastTarget) {
    return <>{activities.map((activity) => renderCard(activity, false))}</>;
  }

  return (
    <div className="rounded-xl border border-accent-primary bg-primary-light/10 p-3">
      <span className="mb-2 block text-xs text-accent-secondary">
        {COPY.pegin.batchedDeposit.groupLabel}
      </span>
      <div className="space-y-3">
        {activities.map((activity) => renderCard(activity, true))}
      </div>
      <div className="mt-3">
        <Button
          variant="contained"
          color="primary"
          className="w-full rounded-full"
          onClick={() => onBroadcastClick(broadcastTarget.id)}
        >
          {COPY.pegin.primaryAction.SIGN_AND_BROADCAST_TO_BITCOIN}
        </Button>
        <span className="mt-2 block text-center text-xs text-accent-secondary">
          {COPY.pegin.batchedDeposit.broadcastHelper}
        </span>
      </div>
    </div>
  );
}
