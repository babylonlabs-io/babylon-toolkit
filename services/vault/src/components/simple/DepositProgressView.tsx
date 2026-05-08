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
import { DepositFlowStep } from "@/hooks/deposit/depositFlowSteps";
import type { PayoutSigningProgress } from "@/services/vault/vaultPayoutSignatureService";

/**
 * Visual step indexing (1-based, matches buildStepItems order).
 * Every row is backed by a real `DepositFlowStep`, so the mapping is 1-to-1.
 */
export function getVisualStep(
  currentStep: DepositFlowStep,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- preserved for API compatibility
  _isWaiting: boolean,
): number {
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
    case DepositFlowStep.COMPLETED:
      return 12;
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
    { label: "Generate secret for the deposit" },
    { label: "Sign the pegIn BTC transaction" },
    { label: "Sign proofs to link your Bitcoin and ETH addresses" },
    { label: "Sign and broadcast ETH registration" },
    { label: "Sign and broadcast BTC pre-pegIn transaction" },
    { label: "Awaiting Bitcoin confirmation", description: "(~ 15 min)" },
    { label: "Confirm deposit secret and submit to Vault Provider" },
    { label: "Confirm deposit secret" },
    {
      label: "Sign payout transactions",
      description:
        payoutTotal > 0 ? `(${payoutCompleted} of ${payoutTotal})` : undefined,
    },
    { label: "Download artifact" },
    { label: "Sign and broadcast reveal secret" },
  ];
}

interface BaseProgressViewProps {
  currentStep: DepositFlowStep;
  isWaiting: boolean;
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

interface SingleVaultProps extends BaseProgressViewProps {
  variant?: "single";
}

interface MultiVaultProps extends BaseProgressViewProps {
  variant: "multi";
  currentVaultIndex: number | null;
}

export type DepositProgressViewProps = SingleVaultProps | MultiVaultProps;

/**
 * Multi-vault uses the same row layout. The previous split into
 * "Sign PoP + Register 1/2" / "Register 2/2" was misleading —
 * `submitPeginRequestBatch` is a single atomic ETH tx, not a per-vault
 * loop, and the second row never highlighted because `currentVaultIndex`
 * is only set during payout signing.
 */
export function getMultiVaultVisualStep(
  currentStep: DepositFlowStep,
  isWaiting: boolean,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- preserved for API compatibility
  _currentVaultIndex: number | null,
): number {
  return getVisualStep(currentStep, isWaiting);
}

export function buildMultiVaultStepItems(
  progress: PayoutSigningProgress | null,
): StepperItem[] {
  return buildStepItems(progress);
}

export function DepositProgressView(props: DepositProgressViewProps) {
  const {
    currentStep,
    isWaiting,
    error,
    isComplete,
    isProcessing,
    canClose,
    canContinueInBackground,
    payoutSigningProgress,
    onClose,
    successMessage = "Your Bitcoin transaction has been broadcast to the network. It will be confirmed after receiving the required number of Bitcoin confirmations.",
    onRetry,
  } = props;

  const isMulti = props.variant === "multi";

  const visualStep = isMulti
    ? getMultiVaultVisualStep(currentStep, isWaiting, props.currentVaultIndex)
    : getVisualStep(currentStep, isWaiting);

  const steps = useMemo(
    () =>
      isMulti
        ? buildMultiVaultStepItems(payoutSigningProgress)
        : buildStepItems(payoutSigningProgress),
    [isMulti, payoutSigningProgress],
  );

  return (
    <div className="w-full max-w-[520px]">
      <Heading variant="h5" className="text-accent-primary">
        Deposit Progress{" "}
        <Text as="span" variant="body1" className="text-accent-secondary">
          (~60 min)
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
            "Close & continue later"
          ) : error ? (
            onRetry ? (
              "Retry"
            ) : (
              "Close"
            )
          ) : isComplete ? (
            "Done"
          ) : isProcessing ? (
            <span className="flex items-center justify-center gap-2">
              <Loader size={16} className="text-accent-contrast" />
              <Text as="span" variant="body2" className="text-accent-contrast">
                Sign
              </Text>
            </span>
          ) : (
            "Sign"
          )}
        </Button>

        <Text
          variant="body2"
          className="text-center text-xs text-accent-secondary"
        >
          Do not spend the Bitcoin used for this deposit until the transaction
          is confirmed on the network.
        </Text>
      </div>
    </div>
  );
}
