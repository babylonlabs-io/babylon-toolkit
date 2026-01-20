import { Loader, Text } from "@babylonlabs-io/core-ui";

import type { SigningStepType } from "../../../services/vault/vaultPayoutSignatureService";
import { DepositStep } from "../DepositSignModal/constants";

/** Progress display modes for the signing flow */
enum ProgressMode {
  /** SIGN_PAYOUTS step, waiting for vault provider to prepare transactions */
  WAITING_FOR_PROVIDER = "waiting_for_provider",
  /** BROADCAST_BTC step, waiting for on-chain verification */
  WAITING_FOR_VERIFICATION = "waiting_for_verification",
  /** SIGN_PAYOUTS step, actively signing payout transactions */
  SIGNING_PAYOUTS = "signing_payouts",
}

export interface SigningProgressProps {
  /** Number of signing steps completed */
  completed: number;
  /** Total number of signing steps */
  total: number;
  /** Current step being signed (null when not actively signing) */
  currentStep: SigningStepType | null;
  /** Current claimer index (1-based) */
  currentClaimer: number;
  /** Total number of claimers */
  totalClaimers: number;
  /** Current deposit flow step. Optional for standalone use. */
  step?: DepositStep;
  /** Whether we're in a waiting/polling state. Optional for standalone use. */
  isWaiting?: boolean;
}

const STEP_LABELS: Record<SigningStepType, string> = {
  payout_optimistic: "PayoutOptimistic",
  payout: "Payout",
};

/**
 * Determine the progress mode based on step and waiting state
 */
function getProgressMode(
  step: DepositStep | undefined,
  isWaiting: boolean | undefined,
  total: number,
): ProgressMode | null {
  // Standalone mode (no step provided) - show signing if total > 0
  if (step === undefined) {
    return total > 0 ? ProgressMode.SIGNING_PAYOUTS : null;
  }

  if (step === DepositStep.SIGN_PAYOUTS && isWaiting) {
    return ProgressMode.WAITING_FOR_PROVIDER;
  }
  if (step === DepositStep.BROADCAST_BTC && isWaiting) {
    return ProgressMode.WAITING_FOR_VERIFICATION;
  }
  if (step === DepositStep.SIGN_PAYOUTS && total > 0) {
    return ProgressMode.SIGNING_PAYOUTS;
  }
  return null;
}

export function SigningProgress({
  step,
  isWaiting,
  completed,
  total,
  currentStep,
  currentClaimer,
  totalClaimers,
}: SigningProgressProps) {
  const mode = getProgressMode(step, isWaiting, total);

  if (!mode) return null;

  if (mode === ProgressMode.WAITING_FOR_PROVIDER) {
    return (
      <div className="rounded-lg bg-primary-light/10 p-4">
        <div className="flex items-center gap-3">
          <Loader size={16} className="text-primary-main" />
          <Text variant="body2" className="text-accent-primary">
            Vault Provider is preparing payout transactions...
          </Text>
        </div>
        <Text variant="body2" className="mt-2 text-sm text-accent-secondary">
          This may take a moment. The provider is generating Claim and Assert
          transactions for your deposit.
        </Text>
      </div>
    );
  }

  if (mode === ProgressMode.WAITING_FOR_VERIFICATION) {
    return (
      <div className="rounded-lg bg-primary-light/10 p-4">
        <div className="flex items-center gap-3">
          <Loader size={16} className="text-primary-main" />
          <Text variant="body2" className="text-accent-primary">
            Waiting for on-chain verification...
          </Text>
        </div>
        <Text variant="body2" className="mt-2 text-sm text-accent-secondary">
          Your payout signatures have been submitted. The system is verifying
          them on-chain before the Bitcoin transaction can be broadcast.
        </Text>
      </div>
    );
  }

  // mode === "signing_payouts"
  const percentage = (completed / total) * 100;
  const stepLabel = currentStep ? STEP_LABELS[currentStep] : null;

  return (
    <div className="rounded-lg bg-primary-light/10 p-4">
      <Text variant="body2" className="text-accent-primary">
        {currentStep ? (
          <>
            Signing <span className="font-medium">{stepLabel}</span>
            {totalClaimers > 1 &&
              ` (Claimer ${currentClaimer}/${totalClaimers})`}{" "}
            — Step {completed + 1} of {total}
          </>
        ) : (
          <>
            Completed {completed} of {total} signatures
          </>
        )}
      </Text>
      <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-primary-light/20">
        <div
          className="h-full bg-primary-main transition-all duration-300"
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
}
