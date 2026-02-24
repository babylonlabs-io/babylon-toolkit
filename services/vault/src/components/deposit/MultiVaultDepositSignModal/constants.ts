import { DepositStep } from "@/hooks/deposit/depositFlowSteps";

// Re-export for convenience
export { DepositStep };

/**
 * 6-step labels for the multi-vault deposit stepper.
 * Steps 1-4 have per-vault labels; steps 5-6 are shared.
 */
export const MULTI_VAULT_STEP_LABELS = [
  "Sign proof of possession for pegin 1/2",
  "Submit peg-in requests for pegin 1/2",
  "Sign proof of possession for pegin 2/2",
  "Submit peg-in requests for pegin 2/2",
  "Sign payout transaction(s)",
  "Sign & broadcast Bitcoin transaction",
] as const;

/**
 * Map the hook's (currentStep, currentVaultIndex) tuple to a 1-indexed
 * visual step position for the 6-step Stepper.
 *
 * Mapping:
 *   SIGN_POP     + vault 0 -> visual 1
 *   SUBMIT_PEGIN + vault 0 -> visual 2
 *   SIGN_POP     + vault 1 -> visual 3
 *   SUBMIT_PEGIN + vault 1 -> visual 4
 *   SIGN_PAYOUTS            -> visual 5
 *   BROADCAST_BTC           -> visual 6
 *   COMPLETED               -> visual 7 (all 6 steps marked complete)
 */
export function getMultiVaultVisualStep(
  currentStep: DepositStep,
  currentVaultIndex: number | null,
): number {
  switch (currentStep) {
    case DepositStep.SIGN_POP:
      return currentVaultIndex === 1 ? 3 : 1;
    case DepositStep.SUBMIT_PEGIN:
      return currentVaultIndex === 1 ? 4 : 2;
    case DepositStep.SIGN_PAYOUTS:
      return 5;
    case DepositStep.BROADCAST_BTC:
      return 6;
    case DepositStep.COMPLETED:
      return 7;
    default:
      return 1;
  }
}

/**
 * Step descriptions with per-vault labeling for PoP and Submit steps.
 */
export function getMultiVaultStepDescription(
  currentStep: DepositStep,
  currentVaultIndex: number | null,
  isWaiting: boolean,
): string {
  const vaultLabel =
    currentVaultIndex !== null ? ` for pegin ${currentVaultIndex + 1}/2` : "";

  switch (currentStep) {
    case DepositStep.SIGN_POP:
      return `Please sign the proof of possession${vaultLabel} in your BTC wallet.`;
    case DepositStep.SUBMIT_PEGIN:
      return `Please sign and submit the peg-in request${vaultLabel} in your ETH wallet.`;
    case DepositStep.SIGN_PAYOUTS:
      return isWaiting
        ? "Waiting for Vault Provider to prepare payout transaction(s)..."
        : "Please sign the payout transaction(s) in your BTC wallet.";
    case DepositStep.BROADCAST_BTC:
      return isWaiting
        ? "Waiting for on-chain verification..."
        : "Please sign and broadcast the Bitcoin transaction in your BTC wallet.";
    case DepositStep.COMPLETED:
      return "Deposit successfully submitted!";
    default:
      return "";
  }
}

/**
 * Same close logic as single-vault: allow close on error, completion,
 * or waiting in SIGN_PAYOUTS+ stages.
 */
export function canCloseMultiVaultModal(
  currentStep: DepositStep,
  error: string | null,
  isWaiting: boolean = false,
): boolean {
  if (error) return true;
  if (currentStep === DepositStep.COMPLETED) return true;
  if (isWaiting && currentStep >= DepositStep.SIGN_PAYOUTS) return true;
  return false;
}
