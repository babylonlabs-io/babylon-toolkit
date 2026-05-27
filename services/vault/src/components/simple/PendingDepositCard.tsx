/**
 * PendingDepositCard Component
 *
 * Renders a single pending deposit as a bordered sub-card within the
 * expanded summary card. Uses VaultDetailCard for the common layout.
 *
 * The card itself is the action surface: when an `onCardClick` is wired
 * (pending list) or the parent batched-group wrapper is clickable, that
 * click opens the deposit multistepper modal which owns every per-vault
 * flow (broadcast, WOTS, sign, activate, artifact download). The card no
 * longer renders its own per-action button.
 */

import {
  getActionStatus,
  PeginAction,
} from "@/components/deposit/actionStatus";
import { getNetworkConfigBTC } from "@/config";
import { useDepositPollingResult } from "@/context/deposit/PeginPollingContext";
import { COPY } from "@/copy";
import { DepositFlowStep } from "@/hooks/deposit/depositFlowSteps/types";
import {
  canPerformAction,
  getPeginDisplayStep,
} from "@/models/peginStateMachine";
import { getTokenBrandColor } from "@/services/token/tokenService";
import type { VaultProvider } from "@/types/vaultProvider";
import { truncateAddress } from "@/utils/addressUtils";

import { computeRemainingEstimateMinutes } from "./DepositProgressView/btcConfirmationProgress";
import { ProgressBar } from "./DepositProgressView/ProgressBar";
import {
  getStepFillPercent,
  getStepLabel,
  getVisualStep,
  TOTAL_VISUAL_STEPS,
} from "./DepositProgressView/steps";
import { PeginTxHashRow } from "./PeginTxHashRow";
import { STATUS_DOT_COLORS } from "./statusColors";
import { VaultDetailCard, VaultStatusBadge } from "./VaultDetailCard";

// The deposited asset is Bitcoin; tint the progress bar with its brand color.
const ASSET_BRAND_COLOR = getTokenBrandColor(getNetworkConfigBTC().coinSymbol);

function formatBtcDepthSummary(
  confirmations: number | null,
  requiredDepth: number,
): string | null {
  if (confirmations === null) return null;
  const minutes = computeRemainingEstimateMinutes(confirmations, requiredDepth);
  if (minutes === null) return COPY.deposit.btcConfirmation.finalizing;
  return COPY.deposit.btcConfirmation.cardSummaryProgressing(
    requiredDepth - confirmations,
    minutes,
  );
}

interface PendingDepositCardProps {
  depositId: string;
  amount: string;
  /** Milliseconds since epoch */
  timestamp?: number;
  /** Raw BTC peg-in transaction hash (hex, may include 0x prefix). */
  peginTxHash?: string;
  /** Pre-PegIn transaction hash (hex, may include 0x prefix). */
  prePeginTxHash?: string;
  providerId: string;
  vaultProviders: VaultProvider[];
  /**
   * Optional handler invoked when the card body is clicked. Opens the
   * deposit multistepper view for the whole batch this card belongs to.
   * Clicks on per-row buttons/links are excluded by the underlying shell.
   */
  onCardClick?: (depositId: string) => void;
}

export function PendingDepositCard({
  depositId,
  amount,
  timestamp,
  peginTxHash,
  prePeginTxHash,
  providerId,
  vaultProviders,
  onCardClick,
}: PendingDepositCardProps) {
  const pollingResult = useDepositPollingResult(depositId);

  if (!pollingResult) return null;

  const { loading, peginState, prePeginConfirmations, requiredPrePeginDepth } =
    pollingResult;
  // `getActionStatus` still drives the disabled-with-tooltip state for
  // wallet-ownership mismatch. Action triggering itself is no longer the
  // card's job — the parent's click handler owns that.
  const status = getActionStatus(pollingResult);
  const dotColor = STATUS_DOT_COLORS[peginState.displayVariant];

  // The Pre-PegIn tx is on Bitcoin only once the depositor has broadcast it.
  // While the broadcast action is still pending, an explorer link would 404, so
  // the Pre-PegIn hash stays copy-only until then.
  const prePeginBroadcast = !canPerformAction(
    peginState,
    PeginAction.SIGN_AND_BROADCAST_TO_BITCOIN,
  );

  // Map the current state onto the shared deposit-flow step model so the card
  // can show "Step X of Y" + a progress bar. `null` when there's no meaningful
  // in-progress step (those states don't reach the pending sections), and while
  // the first poll is still loading — until VP ingestion state arrives the step
  // is ambiguous (a CONFIRMING deposit could be awaiting BTC confirmation or
  // preparing payouts), so we don't assert one and risk a backward jump.
  const step = loading ? null : getPeginDisplayStep(peginState);

  const btcConfirmationSummary =
    step === DepositFlowStep.AWAIT_PAYOUT_TRANSACTIONS
      ? formatBtcDepthSummary(prePeginConfirmations, requiredPrePeginDepth)
      : null;

  // Resolve provider name
  const provider = vaultProviders.find((vp) => vp.id === providerId);
  const providerName =
    provider?.name ?? `Provider ${truncateAddress(providerId)}`;

  return (
    <VaultDetailCard
      amountBtc={parseFloat(amount || "0")}
      timestamp={timestamp ?? 0}
      onClick={onCardClick ? () => onCardClick(depositId) : undefined}
      txHashRow={
        <PeginTxHashRow
          peginTxHash={peginTxHash}
          prePeginTxHash={prePeginTxHash}
          linkPrePegin={prePeginBroadcast}
        />
      }
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
          <span className="text-sm">
            <span className="text-accent-secondary">
              {COPY.deposit.progress.stepPrefix(
                getVisualStep(step),
                TOTAL_VISUAL_STEPS,
              )}{" "}
            </span>
            <span className="font-medium text-accent-primary">
              {getStepLabel(step)}
            </span>
            {btcConfirmationSummary && (
              <span className="text-accent-secondary">{` (${btcConfirmationSummary})`}</span>
            )}
          </span>
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
    />
  );
}
