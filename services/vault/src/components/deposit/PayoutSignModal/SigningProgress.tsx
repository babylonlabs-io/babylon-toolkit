import { Loader, Text } from "@babylonlabs-io/core-ui";

import { DepositFlowStep } from "../DepositSignModal/depositStepHelpers";

/** Progress display modes for the signing flow */
enum ProgressMode {
  /** SIGN_PAYOUTS step, waiting for vault provider to prepare transactions */
  WAITING_FOR_PROVIDER = "waiting_for_provider",
  /** ACTIVATE_VAULT step, waiting for on-chain verification before activation */
  WAITING_FOR_VERIFICATION = "waiting_for_verification",
  /** SIGN_PAYOUTS step, actively signing payout transactions */
  SIGNING_PAYOUTS = "signing_payouts",
}

export interface SigningProgressProps {
  /** Number of signing steps completed */
  completed: number;
  /** Total number of claimers */
  totalClaimers: number;
  /** Current deposit flow step. Optional for standalone use. */
  step?: DepositFlowStep;
  /** Whether we're in a waiting/polling state. Optional for standalone use. */
  isWaiting?: boolean;
}

/**
 * Determine the progress mode based on step and waiting state
 */
function getProgressMode(
  step: DepositFlowStep | undefined,
  isWaiting: boolean | undefined,
  total: number,
): ProgressMode | null {
  // Standalone mode (no step provided) - show signing if total > 0
  if (step === undefined) {
    return total > 0 ? ProgressMode.SIGNING_PAYOUTS : null;
  }

  if (step === DepositFlowStep.SIGN_PAYOUTS && isWaiting) {
    return ProgressMode.WAITING_FOR_PROVIDER;
  }
  if (step === DepositFlowStep.ACTIVATE_VAULT && isWaiting) {
    return ProgressMode.WAITING_FOR_VERIFICATION;
  }
  if (step === DepositFlowStep.SIGN_PAYOUTS && total > 0) {
    return ProgressMode.SIGNING_PAYOUTS;
  }
  return null;
}

export function SigningProgress({
  step,
  isWaiting,
  completed,
  totalClaimers,
}: SigningProgressProps) {
  const total = totalClaimers;
  const currentClaimer = Math.min(completed + 1, total);
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
          This may take 15-20 minutes. You can close this modal and sign later
          from your deposits.
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
          Waiting for vault keepers to verify and acknowledge your deposit
          before activation.
        </Text>
      </div>
    );
  }

  // mode === "signing_payouts"
  const percentage = (completed / total) * 100;
  const isSigning = completed < total;

  return (
    <div className="rounded-lg bg-primary-light/10 p-4">
      <Text variant="body2" className="text-accent-primary">
        {isSigning ? (
          <>
            Signing payout
            {totalClaimers > 1 &&
              ` (Claimer ${currentClaimer}/${totalClaimers})`}
            {total > 1 && ` — Step ${completed + 1} of ${total}`}
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
