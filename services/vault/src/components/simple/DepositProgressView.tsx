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
import { DepositStep } from "@/components/deposit/DepositSignModal/constants";
import type { PayoutSigningProgress } from "@/services/vault/vaultPayoutSignatureService";

/**
 * Map the internal DepositStep + isWaiting to a 1-indexed visual step (1-6).
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
  currentStep: DepositStep,
  isWaiting: boolean,
): number {
  switch (currentStep) {
    case DepositStep.SIGN_POP:
      return 1;
    case DepositStep.SUBMIT_PEGIN:
      return 2;
    case DepositStep.SIGN_PAYOUTS:
      return isWaiting ? 3 : 4;
    case DepositStep.BROADCAST_BTC:
      return isWaiting ? 5 : 6;
    case DepositStep.COMPLETED:
      return 7; // All 6 steps completed
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
    { label: "Wait", description: "(~ 12 mins)" },
    { label: "Submit peg-in transactions" },
  ];
}

export interface DepositProgressViewProps {
  currentStep: DepositStep;
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

export function DepositProgressView({
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
}: DepositProgressViewProps) {
  const visualStep = getVisualStep(currentStep, isWaiting);
  const steps = useMemo(
    () => buildStepItems(payoutSigningProgress),
    [payoutSigningProgress],
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
