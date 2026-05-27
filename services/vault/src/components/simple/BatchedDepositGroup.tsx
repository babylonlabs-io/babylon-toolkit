/**
 * BatchedDepositGroup Component
 *
 * Handles the set of vaults funded by one shared Pre-PegIn Bitcoin
 * transaction (a batched / split pegin).
 *
 * Siblings always render inside a grouped container so it's visually clear
 * they belong to the same deposit. While the shared Pre-PegIn still needs
 * broadcasting, a broadcast button is hoisted to the group (one button for
 * the batch) and suppressed on the inner cards. Once the broadcast is done
 * the button is dropped, but the grouping wrapper stays so the user can
 * still tell at a glance that the cards are siblings.
 */

import { Button } from "@babylonlabs-io/core-ui";

import {
  getActionStatus,
  PeginAction,
} from "@/components/deposit/actionStatus";
import { getNetworkConfigBTC } from "@/config";
import { usePeginPolling } from "@/context/deposit/PeginPollingContext";
import { COPY } from "@/copy";
import type { VaultActivity } from "@/types/activity";
import type { VaultProvider } from "@/types/vaultProvider";
import { formatBtcAmount } from "@/utils/formatting";

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

  const suppressBroadcast = !!broadcastTarget;

  const totalBtc = activities.reduce(
    (sum, activity) => sum + parseFloat(activity.collateral.amount || "0"),
    0,
  );
  const btcSymbol = getNetworkConfigBTC().coinSymbol;

  return (
    <div className="rounded-xl border border-accent-primary bg-primary-light/10 p-3">
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <span className="text-xs text-accent-secondary">
          {COPY.pegin.batchedDeposit.groupLabel}
        </span>
        <span className="text-xs text-accent-secondary">
          {COPY.pegin.batchedDeposit.totalLabel(
            formatBtcAmount(totalBtc),
            btcSymbol,
          )}
        </span>
      </div>
      <div className="space-y-2">
        {activities.map((activity) => (
          <PendingDepositCard
            key={activity.id}
            depositId={activity.id}
            amount={activity.collateral.amount}
            timestamp={activity.timestamp}
            peginTxHash={activity.peginTxHash}
            prePeginTxHash={activity.prePeginTxHash}
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
        ))}
      </div>
      {broadcastTarget && (
        <div className="mt-3">
          <Button
            variant="contained"
            color="primary"
            className="w-full"
            onClick={() => onBroadcastClick(broadcastTarget.id)}
          >
            {COPY.pegin.primaryAction.SIGN_AND_BROADCAST_TO_BITCOIN}
          </Button>
          <span className="mt-2 block text-center text-xs text-accent-secondary">
            {COPY.pegin.batchedDeposit.broadcastHelper}
          </span>
        </div>
      )}
    </div>
  );
}
