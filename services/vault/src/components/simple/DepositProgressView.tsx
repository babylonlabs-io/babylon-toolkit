/**
 * DepositProgressView
 *
 * Pure view component for the deposit progress stepper UI.
 * Used by both the initial deposit flow (DepositSignContent) and
 * the resume flows (payout signing / broadcast from the deposits table).
 *
 * Renders: Heading, Stepper, status banners, action button.
 */

import {
  Button,
  Heading,
  Loader,
  Stepper,
  Text,
  type StepperItem,
} from "@babylonlabs-io/core-ui";
import { useMemo } from "react";

import { StatusBanner } from "@/components/deposit/DepositSignModal/StatusBanner";
import { COPY } from "@/copy";
import { DepositFlowStep } from "@/hooks/deposit/depositFlowSteps";
import type { PayoutSigningProgress } from "@/services/vault/vaultPayoutSignatureService";

/**
 * Visual step indexing (1-based, matches buildStepItems order).
 * Every row is backed by a real `DepositFlowStep`, so the mapping is 1-to-1.
 */
export function getVisualStep(currentStep: DepositFlowStep): number {
  switch (currentStep) {
    case DepositFlowStep.DERIVE_VAULT_SECRET:
      return 1;
    case DepositFlowStep.SIGN_PEGIN_BTC:
      return 2;
    case DepositFlowStep.SIGN_POP:
      return 3;
    case DepositFlowStep.SUBMIT_PEGIN:
      return 4;
    case DepositFlowStep.BROADCAST_PRE_PEGIN:
      return 5;
    case DepositFlowStep.AWAIT_BTC_CONFIRMATION:
      return 6;
    case DepositFlowStep.SUBMIT_WOTS_KEYS:
      return 7;
    case DepositFlowStep.SIGN_AUTH_ANCHOR:
      return 8;
    case DepositFlowStep.SIGN_PAYOUTS:
      return 9;
    case DepositFlowStep.ARTIFACT_DOWNLOAD:
      return 10;
    case DepositFlowStep.ACTIVATE_VAULT:
      return 11;
    default:
      return 1;
  }
}

export function buildStepItems(
  progress: PayoutSigningProgress | null,
): StepperItem[] {
  const payoutTotal = progress?.totalClaimers ?? 0;
  const payoutCompleted = progress?.completed ?? 0;

  return [
    { label: COPY.deposit.steps.generateSecret },
    { label: COPY.deposit.steps.signPeginBtc },
    { label: COPY.deposit.steps.signLinkProofs },
    { label: COPY.deposit.steps.signAndBroadcastEth },
    { label: COPY.deposit.steps.signAndBroadcastPrePegin },
    {
      label: COPY.deposit.steps.awaitBtcConfirmation,
      description: COPY.deposit.steps.awaitBtcConfirmationDuration,
    },
    { label: COPY.deposit.steps.submitWotsKey },
    { label: COPY.deposit.steps.authenticateSession },
    {
      label: COPY.deposit.steps.signPayouts,
      description:
        payoutTotal > 0 ? `(${payoutCompleted} of ${payoutTotal})` : undefined,
    },
    { label: COPY.deposit.steps.downloadArtifact },
    { label: COPY.deposit.steps.revealSecret },
  ];
}

export interface DepositProgressViewProps {
  currentStep: DepositFlowStep;
  error: string | null;
  isComplete: boolean;
  isProcessing: boolean;
  canClose: boolean;
  canContinueInBackground: boolean;
  payoutSigningProgress: PayoutSigningProgress | null;
  onClose: () => void;
  /** Override the default success message */
  successMessage?: string;
  /** Override the default error retry handler (defaults to onClose) */
  onRetry?: () => void;
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
    onClose,
    successMessage = COPY.deposit.progress.defaultSuccessMessage,
    onRetry,
  } = props;

  // On completion, advance past the last row so every circle renders as ✓.
  const visualStep = getVisualStep(currentStep) + (isComplete ? 1 : 0);

  const steps = useMemo(
    () => buildStepItems(payoutSigningProgress),
    [payoutSigningProgress],
  );

  return (
    <div className="w-full max-w-[520px]">
      <Heading variant="h5" className="text-accent-primary">
        {COPY.deposit.progress.heading}{" "}
        <Text as="span" variant="body1" className="text-accent-secondary">
          {COPY.deposit.progress.durationEstimate}
        </Text>
      </Heading>

      <div className="mt-6 flex flex-col gap-6">
        <Stepper steps={steps} currentStep={visualStep} />

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
