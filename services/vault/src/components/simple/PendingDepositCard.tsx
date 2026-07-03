/**
 * PendingDepositCard Component
 *
 * Renders a single pending deposit as a bordered sub-card within the
 * expanded summary card. Uses VaultDetailCard for the common layout.
 *
 * The card body is an action surface: when an `onCardClick` is wired
 * (single pending list / expired list), clicking it opens the deposit
 * multistepper (or the refund modal for expired cards) which owns every
 * per-vault flow (broadcast, WOTS, sign, activate, refund, artifact
 * download).
 *
 * When the deposit has an available next action, the card also surfaces an
 * explicit CTA button for it: the orange primary CTA for forward actions
 * (broadcast / sign / activate …) and a lower-emphasis outlined button for
 * the HTLC refund on expired deposits. The button runs the same handler as
 * the card body. Batched siblings have no `onCardClick` (the group wrapper
 * owns the click and hoists the shared broadcast), so they render no CTA.
 */

import { Button } from "@babylonlabs-io/core-ui";

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
  isRefundInFlightOrSettled,
} from "@/models/peginStateMachine";
import { getTokenBrandColor } from "@/services/token/tokenService";
import type { VaultProvider } from "@/types/vaultProvider";
import { truncateAddress } from "@/utils/addressUtils";
import { getVpExplorerProviderUrl } from "@/utils/explorer";

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

  const {
    loading,
    peginState,
    prePeginConfirmations,
    requiredPrePeginDepth,
    displayStepOverride,
  } = pollingResult;
  // `getActionStatus` drives both the disabled-with-tooltip state (wallet-
  // ownership mismatch) and the CTA below. Executing the action stays the
  // parent's job — the CTA and the card body both route to its click handler.
  const status = getActionStatus(pollingResult);
  const { displayVariant } = peginState;
  const isDanger = displayVariant === "danger";
  const dotColor = isDanger ? undefined : STATUS_DOT_COLORS[displayVariant];

  // The card's click opens the refund modal. Keep it inert once a refund is in
  // flight or settled (covers our own broadcast and one the mempool probe sees
  // from another device) — there's nothing left to do.
  const handleCardClick =
    onCardClick && !isRefundInFlightOrSettled(peginState)
      ? () => onCardClick(depositId)
      : undefined;

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
  // `displayStepOverride` is set only by the dev god-mode panel (to mock any of
  // the 15 flow steps); production always derives the step from the live state.
  const step = loading
    ? null
    : (displayStepOverride ?? getPeginDisplayStep(peginState));

  const btcConfirmationSummary =
    step === DepositFlowStep.AWAIT_PAYOUT_TRANSACTIONS
      ? formatBtcDepthSummary(prePeginConfirmations, requiredPrePeginDepth)
      : null;

  // Resolve provider name
  const provider = vaultProviders.find((vp) => vp.id === providerId);
  const providerName =
    provider?.name ?? `Provider ${truncateAddress(providerId)}`;

  // Surface the available next action as an explicit CTA on cards that own a
  // click handler (single pending + expired; batched siblings defer to the
  // group). Only an `available` status is actionable — disabled (ownership
  // mismatch) and noAction render no button. The HTLC refund reads as a
  // lower-emphasis outlined button; every forward action uses the orange
  // primary CTA. The button runs the same handler as the card body and is
  // excluded from the body click by isInteractiveEventTarget.
  const actionCta =
    status.type === "available" && handleCardClick ? (
      <Button
        variant={
          status.action.action === PeginAction.REFUND_HTLC
            ? "outlined"
            : "contained"
        }
        color={
          status.action.action === PeginAction.REFUND_HTLC
            ? "primary"
            : "secondary"
        }
        className="w-full"
        onClick={handleCardClick}
      >
        {status.action.label}
      </Button>
    ) : undefined;

  return (
    <VaultDetailCard
      amountBtc={parseFloat(amount || "0")}
      timestamp={timestamp}
      onClick={handleCardClick}
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
      providerExplorerUrl={getVpExplorerProviderUrl(providerId)}
      disabled={status.type === "disabled"}
      disabledTooltip={status.type === "disabled" ? status.tooltip : undefined}
      headerEnd={
        <VaultStatusBadge
          dotColor={dotColor}
          isDanger={isDanger}
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
      action={actionCta}
    />
  );
}
