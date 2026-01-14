import { Text } from "@babylonlabs-io/core-ui";

import type { SigningStepType } from "../../../services/vault/vaultPayoutSignatureService";

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
}

const STEP_LABELS: Record<SigningStepType, string> = {
  payout_optimistic: "PayoutOptimistic",
  payout: "Payout",
};

export function SigningProgress({
  completed,
  total,
  currentStep,
  currentClaimer,
  totalClaimers,
}: SigningProgressProps) {
  if (total === 0) return null;

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
