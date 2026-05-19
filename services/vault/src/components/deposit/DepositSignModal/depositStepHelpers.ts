import { COPY } from "@/copy";
import { DepositFlowStep } from "@/hooks/deposit/depositFlowSteps";
import type { PayoutSigningProgress } from "@/services/vault/vaultPayoutSignatureService";

/**
 * Step descriptions for deposit flow
 */
export const STEP_DESCRIPTIONS: Partial<
  Record<DepositFlowStep, { active: string; waiting?: string }>
> = {
  [DepositFlowStep.DERIVE_VAULT_SECRET]: {
    active: COPY.deposit.stepDescriptions.deriveVaultSecret,
  },
  [DepositFlowStep.SIGN_PEGIN_BTC]: {
    active: COPY.deposit.stepDescriptions.signPeginBtc,
  },
  [DepositFlowStep.SIGN_POP]: {
    active: COPY.deposit.stepDescriptions.signPop,
  },
  [DepositFlowStep.SUBMIT_PEGIN]: {
    active: COPY.deposit.stepDescriptions.submitPegin,
  },
  [DepositFlowStep.BROADCAST_PRE_PEGIN]: {
    active: COPY.deposit.stepDescriptions.broadcastPrePeginActive,
  },
  [DepositFlowStep.AWAIT_BTC_CONFIRMATION]: {
    active: COPY.deposit.stepDescriptions.awaitBtcConfirmation,
    waiting: COPY.deposit.stepDescriptions.awaitBtcConfirmation,
  },
  [DepositFlowStep.SUBMIT_WOTS_KEYS]: {
    active: COPY.deposit.stepDescriptions.submitWotsActive,
    waiting: COPY.deposit.stepDescriptions.submitWotsWaiting,
  },
  [DepositFlowStep.SIGN_AUTH_ANCHOR]: {
    active: COPY.deposit.stepDescriptions.signAuthAnchor,
  },
  [DepositFlowStep.SIGN_PAYOUTS]: {
    active: COPY.deposit.stepDescriptions.signPayoutsActive,
    waiting: COPY.deposit.stepDescriptions.signPayoutsWaiting,
  },
  [DepositFlowStep.ARTIFACT_DOWNLOAD]: {
    active: COPY.deposit.stepDescriptions.artifactDownloadActive,
    waiting: COPY.deposit.stepDescriptions.artifactDownloadWaiting,
  },
  [DepositFlowStep.ACTIVATE_VAULT]: {
    active: COPY.deposit.stepDescriptions.activateVaultActive,
    waiting: COPY.deposit.stepDescriptions.activateVaultWaiting,
  },
  [DepositFlowStep.COMPLETED]: {
    active: COPY.deposit.stepDescriptions.completed,
  },
};

/**
 * Get the description text for the current step
 */
export function getStepDescription(
  step: DepositFlowStep,
  isWaiting: boolean,
  payoutProgress: PayoutSigningProgress | null,
): string {
  const desc = STEP_DESCRIPTIONS[step];
  if (!desc) return "";

  // Show detailed progress for payout signing step
  if (
    step === DepositFlowStep.SIGN_PAYOUTS &&
    payoutProgress &&
    payoutProgress.completed < payoutProgress.totalClaimers
  ) {
    const currentClaimer = payoutProgress.completed + 1;
    const claimerInfo =
      payoutProgress.totalClaimers > 1
        ? ` (Claimer ${currentClaimer}/${payoutProgress.totalClaimers})`
        : "";
    return `Signing payout${claimerInfo} — Step ${payoutProgress.completed + 1} of ${payoutProgress.totalClaimers}`;
  }

  return isWaiting && desc.waiting ? desc.waiting : desc.active;
}

/**
 * Determine if the modal can be closed
 */
export function canCloseModal(
  currentStep: DepositFlowStep,
  error: string | null,
  isWaiting: boolean = false,
): boolean {
  if (error) return true;
  if (currentStep === DepositFlowStep.COMPLETED) return true;
  // Artifact download is closeable when the user is actively reviewing
  // (no current wait) or while we're waiting for VP verification.
  if (currentStep === DepositFlowStep.ARTIFACT_DOWNLOAD) return true;
  if (
    isWaiting &&
    (currentStep === DepositFlowStep.AWAIT_BTC_CONFIRMATION ||
      currentStep === DepositFlowStep.SUBMIT_WOTS_KEYS ||
      currentStep === DepositFlowStep.SIGN_AUTH_ANCHOR ||
      currentStep === DepositFlowStep.SIGN_PAYOUTS ||
      currentStep === DepositFlowStep.ACTIVATE_VAULT)
  )
    return true;
  return false;
}

/**
 * Compute derived UI state from flow state.
 * Used by DepositSignContent.
 */
export function computeDepositDerivedState(
  currentStep: DepositFlowStep,
  processing: boolean,
  isWaiting: boolean,
  error: string | null,
) {
  const isComplete = currentStep === DepositFlowStep.COMPLETED;
  return {
    isComplete,
    canClose: canCloseModal(currentStep, error, isWaiting),
    isProcessing: (processing || isWaiting) && !error && !isComplete,
    canContinueInBackground:
      isWaiting &&
      currentStep >= DepositFlowStep.AWAIT_BTC_CONFIRMATION &&
      !error,
  };
}
