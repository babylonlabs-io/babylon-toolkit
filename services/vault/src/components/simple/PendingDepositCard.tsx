/**
 * PendingDepositCard Component
 *
 * Renders a single pending deposit as a bordered sub-card within the
 * expanded summary card. Uses VaultDetailCard for the common layout.
 */

import { Button } from "@babylonlabs-io/core-ui";

import type {
  ClaimerTransactions,
  DepositorGraphTransactions,
} from "@/clients/vault-provider-rpc/types";
import {
  getActionStatus,
  isArtifactDownloadAvailable,
  PeginAction,
} from "@/components/deposit/actionStatus";
import { useDepositPollingResult } from "@/context/deposit/PeginPollingContext";
import type { VaultProvider } from "@/types/vaultProvider";
import { truncateAddress } from "@/utils/addressUtils";

import { STATUS_DOT_COLORS } from "./statusColors";
import { VaultDetailCard, VaultStatusBadge } from "./VaultDetailCard";

interface PendingDepositCardProps {
  depositId: string;
  amount: string;
  /** Milliseconds since epoch */
  timestamp?: number;
  txHash?: string;
  providerId: string;
  vaultProviders: VaultProvider[];
  onSignClick: (
    depositId: string,
    transactions: ClaimerTransactions[],
    depositorGraph: DepositorGraphTransactions,
  ) => void;
  onBroadcastClick: (depositId: string) => void;
  onWotsKeyClick: (depositId: string) => void;
  onActivationClick: (depositId: string) => void;
  onRefundClick: (depositId: string) => void;
  onArtifactDownloadClick?: (depositId: string) => void;
}

export function PendingDepositCard({
  depositId,
  amount,
  timestamp,
  txHash,
  providerId,
  vaultProviders,
  onSignClick,
  onBroadcastClick,
  onWotsKeyClick,
  onActivationClick,
  onRefundClick,
  onArtifactDownloadClick,
}: PendingDepositCardProps) {
  const pollingResult = useDepositPollingResult(depositId);

  if (!pollingResult) return null;

  const { loading, transactions, depositorGraph, peginState } = pollingResult;
  const status = getActionStatus(pollingResult);
  const isActionable = status.type === "available";
  const showArtifactDownload =
    onArtifactDownloadClick && isArtifactDownloadAvailable(pollingResult);

  const handleClick = () => {
    if (status.type !== "available") return;

    const { action } = status.action;
    if (action === PeginAction.SUBMIT_WOTS_KEY) {
      onWotsKeyClick(depositId);
    } else if (action === PeginAction.SIGN_PAYOUT_TRANSACTIONS) {
      if (transactions && depositorGraph) {
        onSignClick(depositId, transactions, depositorGraph);
      }
    } else if (action === PeginAction.SIGN_AND_BROADCAST_TO_BITCOIN) {
      onBroadcastClick(depositId);
    } else if (action === PeginAction.ACTIVATE_VAULT) {
      onActivationClick(depositId);
    } else if (action === PeginAction.REFUND_HTLC) {
      onRefundClick(depositId);
    }
  };

  const actionLabel =
    status.type === "available" ? status.action.label : peginState.displayLabel;
  const label = loading && !transactions ? "Loading..." : actionLabel;
  const buttonDisabled = !isActionable || (loading && !transactions);
  const dotColor = STATUS_DOT_COLORS[peginState.displayVariant];

  // Resolve provider name
  const provider = vaultProviders.find((vp) => vp.id === providerId);
  const providerName =
    provider?.name ?? `Provider ${truncateAddress(providerId)}`;

  return (
    <VaultDetailCard
      amountBtc={parseFloat(amount || "0")}
      timestamp={timestamp ?? 0}
      txHash={txHash}
      providerName={providerName}
      providerIconUrl={provider?.iconUrl}
      statusContent={
        <VaultStatusBadge
          dotColor={dotColor}
          label={peginState.displayLabel}
          tooltip={peginState.message}
        />
      }
      action={
        isActionable || showArtifactDownload ? (
          <div className="flex flex-col items-stretch gap-2">
            {isActionable && (
              <Button
                variant="outlined"
                color="primary"
                className="w-full rounded-full"
                disabled={buttonDisabled}
                onClick={handleClick}
              >
                {label}
              </Button>
            )}
            {showArtifactDownload && (
              <Button
                variant="outlined"
                color="primary"
                className="w-full rounded-full"
                onClick={() => onArtifactDownloadClick?.(depositId)}
              >
                Download Artifacts
              </Button>
            )}
          </div>
        ) : undefined
      }
    />
  );
}
