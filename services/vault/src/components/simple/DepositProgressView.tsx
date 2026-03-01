/**
 * DepositProgressView
 *
 * Pure view component for the deposit progress stepper UI.
 * Used by both the initial deposit flow (DepositSignContent) and
 * the resume flows (payout signing / broadcast from the deposits table).
 *
 * Renders: Heading, 6-step Stepper, status banners, action button.
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
import { DepositFlowStep } from "@/components/deposit/DepositSignModal/depositStepHelpers";
import type { PayoutSigningProgress } from "@/services/vault/vaultPayoutSignatureService";

/**
 * Map the internal DepositFlowStep + isWaiting to a 1-indexed visual step (1-6).
 *
 * Visual steps:
 * 1. Sign proof of possession
 * 2. Submit peg-in requests
 * 3. Wait (~ 15 min)
 * 4. Sign payout transactions
 * 5. Wait (~ 12 mins)
 * 6. Submit peg-in transactions
 */
export function getVisualStep(
  currentStep: DepositFlowStep,
  isWaiting: boolean,
): number {
  switch (currentStep) {
    case DepositFlowStep.SIGN_POP:
      return 1;
    case DepositFlowStep.SUBMIT_PEGIN:
      return 2;
    case DepositFlowStep.SIGN_PAYOUTS:
      return isWaiting ? 3 : 4;
    case DepositFlowStep.ARTIFACT_DOWNLOAD:
      return 5;
    case DepositFlowStep.BROADCAST_BTC:
      return isWaiting ? 6 : 7;
    case DepositFlowStep.COMPLETED:
      return 8;
    default:
      return 1;
  }
}

export function buildStepItems(
  progress: PayoutSigningProgress | null,
): StepperItem[] {
  const payoutTotal = progress?.total ?? 0;
  const payoutCompleted = progress?.completed ?? 0;

  return [
    { label: "Sign proof of possession" },
    { label: "Submit peg-in requests" },
    { label: "Wait", description: "(~ 15 min)" },
    {
      label: "Sign payout transactions",
      description:
        payoutTotal > 0 ? `(${payoutCompleted} of ${payoutTotal})` : undefined,
    },
    { label: "Download vault artifacts" },
    { label: "Wait", description: "(~ 12 mins)" },
    { label: "Submit peg-in transactions" },
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
  strategy: "MULTI_INPUT" | "SPLIT";
}

export type DepositProgressViewProps = SingleVaultProps | MultiVaultProps;

/**
 * Map DepositFlowStep + vault index + strategy to a 1-indexed visual step for multi-vault.
 *
 * SPLIT (7 steps):    Sign split TX → Sign PoP + Submit 1/2 → Submit 2/2 → Wait → Sign payouts → Wait → Broadcast
 * MULTI_INPUT (6 steps): Sign PoP + Submit 1/2 → Submit 2/2 → Wait → Sign payouts → Wait → Broadcast
 */
export function getMultiVaultVisualStep(
  currentStep: DepositFlowStep,
  isWaiting: boolean,
  currentVaultIndex: number | null,
  strategy: "MULTI_INPUT" | "SPLIT",
): number {
  const offset = strategy === "SPLIT" ? 1 : 0;

  switch (currentStep) {
    case DepositFlowStep.SIGN_SPLIT_TX:
      return 1; // Only for SPLIT
    case DepositFlowStep.SIGN_POP:
    case DepositFlowStep.SUBMIT_PEGIN:
      // Vault 0 = step 1+offset, Vault 1 = step 2+offset
      return offset + 1 + (currentVaultIndex ?? 0);
    case DepositFlowStep.SIGN_PAYOUTS:
      return isWaiting ? offset + 3 : offset + 4;
    case DepositFlowStep.BROADCAST_BTC:
      return isWaiting ? offset + 5 : offset + 6;
    case DepositFlowStep.COMPLETED:
      return offset + 7;
    default:
      return 1;
  }
}

export function buildMultiVaultStepItems(
  strategy: "MULTI_INPUT" | "SPLIT",
  progress: PayoutSigningProgress | null,
): StepperItem[] {
  const payoutTotal = progress?.total ?? 0;
  const payoutCompleted = progress?.completed ?? 0;

  const steps: StepperItem[] = [];

  if (strategy === "SPLIT") {
    steps.push({ label: "Sign split transaction" });
  }

  steps.push(
    { label: "Sign PoP + Submit pegin 1/2" },
    { label: "Submit pegin 2/2" },
    { label: "Wait", description: "(~ 15 min)" },
    {
      label: "Sign payout transactions",
      description:
        payoutTotal > 0 ? `(${payoutCompleted} of ${payoutTotal})` : undefined,
    },
    { label: "Wait", description: "(~ 12 mins)" },
    { label: "Broadcast" },
  );

  return steps;
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
    ? getMultiVaultVisualStep(
        currentStep,
        isWaiting,
        props.currentVaultIndex,
        props.strategy,
      )
    : getVisualStep(currentStep, isWaiting);

  const steps = useMemo(
    () =>
      isMulti
        ? buildMultiVaultStepItems(
            (props as MultiVaultProps).strategy,
            payoutSigningProgress,
          )
        : buildStepItems(payoutSigningProgress),
    [isMulti, props, payoutSigningProgress],
  );

  return (
    <div className="w-full max-w-[520px]">
      <Heading variant="h5" className="text-accent-primary">
        Deposit Progress
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
            "You can close and come back later"
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
