/**
 * PendingDepositCard Component
 *
 * Renders a single pending deposit as a bordered sub-card within the
 * expanded summary card. Uses VaultDetailCard for the common layout.
 */

import { Button } from "@babylonlabs-io/core-ui";

import {
  getActionStatus,
  isArtifactDownloadAvailable,
  PeginAction,
} from "@/components/deposit/actionStatus";
import { getNetworkConfigBTC } from "@/config";
import { useDepositPollingResult } from "@/context/deposit/PeginPollingContext";
import { COPY } from "@/copy";
import { getPeginDisplayStep } from "@/models/peginStateMachine";
import { getTokenBrandColor } from "@/services/token/tokenService";
import type { VaultProvider } from "@/types/vaultProvider";
import { truncateAddress } from "@/utils/addressUtils";

import { ProgressBar } from "./DepositProgressView/ProgressBar";
import {
  getStepFillPercent,
  getStepLabel,
  getVisualStep,
  TOTAL_VISUAL_STEPS,
} from "./DepositProgressView/steps";
import { DepositStepLabel } from "./DepositStepLabel";
import { STATUS_DOT_COLORS } from "./statusColors";
import { VaultDetailCard, VaultStatusBadge } from "./VaultDetailCard";

// The deposited asset is Bitcoin; tint the progress bar with its brand color.
const ASSET_BRAND_COLOR = getTokenBrandColor(getNetworkConfigBTC().coinSymbol);

interface PendingDepositCardProps {
  depositId: string;
  amount: string;
  /** Milliseconds since epoch */
  timestamp?: number;
  txHash?: string;
  providerId: string;
  vaultProviders: VaultProvider[];
  onSignClick: (depositId: string) => void;
  onBroadcastClick: (depositId: string) => void;
  onWotsKeyClick: (depositId: string) => void;
  onActivationClick: (depositId: string) => void;
  onRefundClick: (depositId: string) => void;
  onArtifactDownloadClick?: (depositId: string) => void;
  /**
   * When true, the Pre-PegIn broadcast button is not rendered on this card.
   * Set when the card sits inside a BatchedDepositGroup, where the broadcast
   * is a batch-level action hoisted to the group. Other per-vault actions
   * (sign, WOTS, activate, refund) still render.
   */
  suppressBroadcastAction?: boolean;
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
  suppressBroadcastAction,
}: PendingDepositCardProps) {
  const pollingResult = useDepositPollingResult(depositId);

  if (!pollingResult) return null;

  const { loading, peginState } = pollingResult;
  const status = getActionStatus(pollingResult);
  // The Pre-PegIn broadcast is batch-level: when this card is inside a
  // BatchedDepositGroup the broadcast button is hoisted to the group and
  // suppressed here. Other per-vault actions still render.
  const broadcastSuppressed =
    !!suppressBroadcastAction &&
    (status.type === "available" || status.type === "disabled") &&
    status.action.action === PeginAction.SIGN_AND_BROADCAST_TO_BITCOIN;
  const hasAction =
    (status.type === "available" || status.type === "disabled") &&
    !broadcastSuppressed;
  const isActionable = status.type === "available" && !broadcastSuppressed;
  const showArtifactDownload =
    onArtifactDownloadClick && isArtifactDownloadAvailable(pollingResult);

  const handleClick = () => {
    if (status.type !== "available") return;

    const { action } = status.action;
    if (action === PeginAction.SUBMIT_WOTS_KEY) {
      onWotsKeyClick(depositId);
    } else if (action === PeginAction.SIGN_PAYOUT_TRANSACTIONS) {
      onSignClick(depositId);
    } else if (action === PeginAction.SIGN_AND_BROADCAST_TO_BITCOIN) {
      onBroadcastClick(depositId);
    } else if (action === PeginAction.ACTIVATE_VAULT) {
      onActivationClick(depositId);
    } else if (action === PeginAction.REFUND_HTLC) {
      onRefundClick(depositId);
    }
  };

  const actionLabel =
    status.type === "available" || status.type === "disabled"
      ? status.action.label
      : peginState.displayLabel;
  // `loading` is React Query's `isLoading` — true only on the very first fetch,
  // not on subsequent polling refetches — so this gives a one-shot "Loading..."
  // on initial mount without flickering on every poll cycle.
  const label = loading ? COPY.common.loading : actionLabel;
  const buttonDisabled = !isActionable || loading;
  const dotColor = STATUS_DOT_COLORS[peginState.displayVariant];

  // Map the current state onto the shared deposit-flow step model so the card
  // can show "Step X of Y" + a progress bar. `null` when there's no meaningful
  // in-progress step (those states don't reach the pending sections), and while
  // the first poll is still loading — until VP ingestion state arrives the step
  // is ambiguous (a CONFIRMING deposit could be awaiting BTC confirmation or
  // preparing payouts), so we don't assert one and risk a backward jump.
  const step = loading ? null : getPeginDisplayStep(peginState);

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
      providerAddress={providerId}
      disabled={status.type === "disabled"}
      disabledTooltip={status.type === "disabled" ? status.tooltip : undefined}
      headerEnd={
        <VaultStatusBadge
          dotColor={dotColor}
          label={peginState.displayLabel}
          tooltip={peginState.message}
        />
      }
      amountSubtext={
        step !== null ? (
          <DepositStepLabel
            visualStep={getVisualStep(step)}
            totalSteps={TOTAL_VISUAL_STEPS}
            label={getStepLabel(step)}
          />
        ) : peginState.inlineSubtext ? (
          <span className="text-sm text-accent-secondary">
            {peginState.inlineSubtext}
          </span>
        ) : null
      }
      belowHeader={
        step !== null && (
          <ProgressBar
            percent={getStepFillPercent(step)}
            color={ASSET_BRAND_COLOR}
          />
        )
      }
      action={
        hasAction || showArtifactDownload ? (
          <div className="flex flex-col items-stretch gap-2">
            {hasAction && (
              <Button
                variant="outlined"
                color="primary"
                className="w-full"
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
                className="w-full"
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
