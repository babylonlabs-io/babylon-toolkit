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
  type StepperItem,
} from "@babylonlabs-io/core-ui";
import { useMemo } from "react";
import { IoCheckmarkSharp } from "react-icons/io5";

import { StatusBanner } from "@/components/deposit/DepositSignModal/StatusBanner";
import { DepositFlowStep } from "@/hooks/deposit/depositFlowSteps/types";
import type { PayoutSigningProgress } from "@/services/vault/vaultPayoutSignatureService";

const TOTAL_VISUAL_STEPS = 11;

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
    { label: "Generate secret for the deposit" },
    { label: "Sign the pegIn BTC transaction" },
    { label: "Sign proofs to link your Bitcoin and ETH addresses" },
    { label: "Sign and broadcast ETH registration" },
    { label: "Sign and broadcast BTC pre-pegIn transaction" },
    { label: "Awaiting Bitcoin confirmation", description: "(~ 15 min)" },
    { label: "Submit WOTS public key to Vault Provider" },
    { label: "Authenticate session with Vault Provider" },
    {
      label: "Sign payout transactions",
      description:
        payoutTotal > 0 ? `(${payoutCompleted} of ${payoutTotal})` : undefined,
    },
    { label: "Download artifact" },
    { label: "Sign and broadcast reveal secret" },
  ];
}

function ProgressBar({ percent }: { percent: number }) {
  const clamped = Math.max(0, Math.min(1, percent));
  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={1}
      aria-valuenow={clamped}
      className="h-1 w-full overflow-hidden rounded-full bg-secondary-strokeLight"
    >
      <div
        className="h-full bg-success-light transition-[width] duration-300"
        style={{ width: `${clamped * 100}%` }}
      />
    </div>
  );
}

function CompletedStepsPill({
  completed,
  total,
}: {
  completed: number;
  total: number;
}) {
  return (
    <div className="flex items-center gap-4 rounded-lg bg-success-main/10 p-2">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-success-light">
        <IoCheckmarkSharp size={16} className="text-success-light" />
      </div>
      <Text as="span" variant="body2" className="text-success-light">
        {completed} of {total} steps completed
      </Text>
    </div>
  );
}

function StepConnector() {
  return (
    <div className="ml-[15px] h-6 w-0 border-l-2 border-solid border-secondary-strokeDark" />
  );
}

function ActiveStepRow({
  number,
  label,
  description,
}: {
  number: number;
  label: string;
  description?: string;
}) {
  return (
    <div className="flex items-center gap-3">
      <div
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 border-secondary-strokeDark"
        aria-label={`Step ${number} active`}
      >
        <Loader size={16} className="text-accent-primary" />
      </div>
      <div className="flex items-baseline gap-2">
        <Text
          as="span"
          variant="body1"
          className="font-medium text-accent-primary"
        >
          {label}
        </Text>
        {description && (
          <Text as="span" variant="body2" className="text-accent-secondary">
            {description}
          </Text>
        )}
      </div>
    </div>
  );
}

function PendingStepRow({ number, label }: { number: number; label: string }) {
  return (
    <div className="flex items-center gap-3">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 border-secondary-strokeDark">
        <Text
          as="span"
          variant="body2"
          className="font-medium text-accent-secondary"
        >
          {number}
        </Text>
      </div>
      <Text as="span" variant="body2" className="text-accent-secondary">
        {label}
      </Text>
    </div>
  );
}

function PostSignProgress({
  steps,
  completedCount,
  totalSteps,
}: {
  steps: StepperItem[];
  completedCount: number;
  totalSteps: number;
}) {
  const visibleSteps = steps.slice(completedCount);

  return (
    <div className="flex flex-col">
      <CompletedStepsPill completed={completedCount} total={totalSteps} />
      {visibleSteps.length > 0 && <StepConnector />}
      {visibleSteps.map((step, index) => {
        const stepNumber = completedCount + index + 1;
        const isActive = index === 0;
        const isLast = index === visibleSteps.length - 1;

        return (
          <div key={stepNumber}>
            {isActive ? (
              <ActiveStepRow
                number={stepNumber}
                label={step.label}
                description={step.description}
              />
            ) : (
              <PendingStepRow number={stepNumber} label={step.label} />
            )}
            {!isLast && <StepConnector />}
          </div>
        );
      })}
    </div>
  );
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
    successMessage = "Your Bitcoin transaction has been broadcast to the network. It will be confirmed after receiving the required number of Bitcoin confirmations.",
    onRetry,
  } = props;

  // On completion, advance past the last row so every circle renders as ✓.
  const visualStep = getVisualStep(currentStep) + (isComplete ? 1 : 0);
  const completedSteps = Math.max(
    0,
    Math.min(TOTAL_VISUAL_STEPS, visualStep - 1),
  );
  const showOverallProgress = completedSteps >= 1;

  const steps = useMemo(
    () => buildStepItems(payoutSigningProgress),
    [payoutSigningProgress],
  );

  return (
    <div className="w-full max-w-[520px]">
      <Heading variant="h5" className="text-accent-primary">
        Deposit Progress{" "}
        <Text as="span" variant="body1" className="text-accent-secondary">
          (~60 min)
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
            totalSteps={TOTAL_VISUAL_STEPS}
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
