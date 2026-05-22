/**
 * DepositProgressView
 *
 * Pure view component for the deposit progress stepper UI.
 * Used by both the initial deposit flow (DepositSignContent) and
 * the resume flows (payout signing / broadcast from the deposits table).
 *
 * Renders: Heading, progress bar (post-sign), Stepper, status banners, action button.
 */

import {
  Button,
  Heading,
  Loader,
  Stepper,
  Text,
} from "@babylonlabs-io/core-ui";
import { useMemo } from "react";

import { StatusBanner } from "@/components/deposit/DepositSignModal/StatusBanner";
import { COPY } from "@/copy";
import { DepositFlowStep } from "@/hooks/deposit/depositFlowSteps/types";
import type { PayoutSigningProgress } from "@/services/vault/vaultPayoutSignatureService";
import type { PeginSigningProgress } from "@/services/vault/vaultTransactionService";

import { BtcConfirmationDetailContainer } from "./BtcConfirmationDetailContainer";
import { PostSignProgress } from "./PostSignProgress";
import { ProgressBar } from "./ProgressBar";
import { buildStepItems, getVisualStep, TOTAL_VISUAL_STEPS } from "./steps";

export interface BtcConfirmationDetailData {
  /** Date.now() when the AWAIT_BTC_CONFIRMATION step was first entered. */
  startedAt: number;
  /** Pre-PegIn broadcast txid — the tx actually on the Bitcoin network. */
  prePeginTxid: string;
}

export interface DepositProgressViewProps {
  currentStep: DepositFlowStep;
  error: string | null;
  isComplete: boolean;
  isProcessing: boolean;
  canClose: boolean;
  canContinueInBackground: boolean;
  payoutSigningProgress: PayoutSigningProgress | null;
  /** Peg-in BTC signing progress; drives the (x of n) sub-counter for splits. */
  peginSigningProgress: PeginSigningProgress | null;
  onClose: () => void;
  /** Override the default success message */
  successMessage?: string;
  /** Override the default error retry handler (defaults to onClose) */
  onRetry?: () => void;
  /**
   * Data backing the expanded "Awaiting Bitcoin confirmation" detail panel.
   * Only rendered when the active step is AWAIT_BTC_CONFIRMATION.
   */
  btcConfirmationDetail?: BtcConfirmationDetailData | null;
}

export function DepositProgressView(props: DepositProgressViewProps) {
  const {
    currentStep,
    error,
    isComplete,
    isProcessing,
    canClose,
    canContinueInBackground,
    payoutSigningProgress,
    peginSigningProgress,
    onClose,
    successMessage = COPY.deposit.progress.defaultSuccessMessage,
    onRetry,
    btcConfirmationDetail,
  } = props;

  // On completion, advance past the last row so every circle renders as ✓.
  const visualStep = getVisualStep(currentStep) + (isComplete ? 1 : 0);
  const completedSteps = Math.max(
    0,
    Math.min(TOTAL_VISUAL_STEPS, visualStep - 1),
  );
  const showOverallProgress = completedSteps >= 1;

  const steps = useMemo(
    () => buildStepItems(payoutSigningProgress, peginSigningProgress),
    [payoutSigningProgress, peginSigningProgress],
  );

  const activeStepDetail =
    currentStep === DepositFlowStep.AWAIT_BTC_CONFIRMATION &&
    btcConfirmationDetail ? (
      <BtcConfirmationDetailContainer
        startedAt={btcConfirmationDetail.startedAt}
        prePeginTxid={btcConfirmationDetail.prePeginTxid}
      />
    ) : null;

  return (
    <div className="w-full max-w-[520px]">
      <Heading variant="h5" className="text-accent-primary">
        {COPY.deposit.progress.heading}{" "}
        <Text as="span" variant="body1" className="text-accent-secondary">
          {COPY.deposit.progress.durationEstimate}
        </Text>
      </Heading>

      {showOverallProgress && (
        <div className="mt-3">
          <ProgressBar percent={completedSteps / TOTAL_VISUAL_STEPS} />
        </div>
      )}

      <div className="mt-6 flex flex-col gap-6">
        {showOverallProgress ? (
          <PostSignProgress
            steps={steps}
            completedCount={completedSteps}
            activeStepDetail={activeStepDetail}
          />
        ) : (
          <Stepper steps={steps} currentStep={visualStep} />
        )}

        {error && <StatusBanner variant="error">{error}</StatusBanner>}

        {isComplete && (
          <StatusBanner variant="success">{successMessage}</StatusBanner>
        )}

        <Button
          disabled={!canClose}
          variant="contained"
          color="secondary"
          className="w-full"
          onClick={error && onRetry ? onRetry : onClose}
        >
          {canContinueInBackground ? (
            COPY.deposit.progress.buttons.closeContinueLater
          ) : error ? (
            onRetry ? (
              COPY.deposit.progress.buttons.retry
            ) : (
              COPY.deposit.progress.buttons.close
            )
          ) : isComplete ? (
            COPY.deposit.progress.buttons.done
          ) : isProcessing ? (
            <span className="flex items-center justify-center gap-2">
              <Loader size={16} className="text-accent-contrast" />
              <Text as="span" variant="body2" className="text-accent-contrast">
                {COPY.deposit.progress.buttons.sign}
              </Text>
            </span>
          ) : (
            COPY.deposit.progress.buttons.sign
          )}
        </Button>

        <Text
          variant="body2"
          className="text-center text-xs text-accent-secondary"
        >
          {COPY.deposit.progress.doNotSpendWarning}
        </Text>
      </div>
    </div>
  );
}
