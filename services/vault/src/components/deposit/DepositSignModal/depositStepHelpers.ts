import { DepositFlowStep } from "@/hooks/deposit/depositFlowSteps";
import type { PayoutSigningProgress } from "@/services/vault/vaultPayoutSignatureService";

/**
 * Step descriptions for deposit flow
 */
export const STEP_DESCRIPTIONS: Partial<
  Record<DepositFlowStep, { active: string; waiting?: string }>
> = {
  [DepositFlowStep.DERIVE_VAULT_SECRET]: {
    active:
      "Approve the deterministic signature in your BTC wallet to derive your vault's HTLC secret.",
  },
  [DepositFlowStep.SIGN_PEGIN_BTC]: {
    active: "Sign the peg-in transaction in your BTC wallet.",
  },
  [DepositFlowStep.SIGN_POP]: {
    active: "Please sign the proof of possession (PoP) in your BTC wallet.",
  },
  [DepositFlowStep.SUBMIT_PEGIN]: {
    active: "Please sign and submit the peg-in transaction in your ETH wallet.",
  },
  [DepositFlowStep.BROADCAST_PRE_PEGIN]: {
    active:
      "Please sign the Pre-PegIn transaction in your BTC wallet. It will be broadcast to Bitcoin immediately after.",
  },
  [DepositFlowStep.AWAIT_BTC_CONFIRMATION]: {
    active: "Waiting for Bitcoin to confirm the Pre-PegIn transaction...",
    waiting: "Waiting for Bitcoin to confirm the Pre-PegIn transaction...",
  },
  [DepositFlowStep.SUBMIT_WOTS_KEYS]: {
    active: "Submitting your WOTS public key to the Vault Provider.",
    waiting: "Waiting for the Vault Provider to prepare payout transactions...",
  },
  [DepositFlowStep.SIGN_AUTH_ANCHOR]: {
    active:
      "Approve the deterministic signature in your BTC wallet to authenticate with the Vault Provider.",
  },
  [DepositFlowStep.SIGN_PAYOUTS]: {
    active: "Please sign the payout transaction(s) in your BTC wallet.",
    waiting: "Waiting for Vault Provider to prepare payout transaction(s)...",
  },
  [DepositFlowStep.ARTIFACT_DOWNLOAD]: {
    active: "Download your vault artifacts before continuing.",
    waiting:
      "Waiting for the Vault Provider to verify your deposit on-chain...",
  },
  [DepositFlowStep.ACTIVATE_VAULT]: {
    active: "Revealing HTLC secret on Ethereum to activate the vault.",
    waiting: "Waiting for on-chain verification...",
  },
  [DepositFlowStep.COMPLETED]: {
    active: "Deposit successfully submitted!",
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
