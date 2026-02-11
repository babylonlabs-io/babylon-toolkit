import { DepositStep } from "@/hooks/deposit/depositFlowSteps";

/**
 * Get description text for current step in multi-vault flow
 */
export function getMultiVaultStepDescription(
  step: DepositStep,
  currentVaultIndex: number | null,
  totalVaults: number,
  isWaiting: boolean,
): string {
  const vaultProgress =
    currentVaultIndex !== null
      ? ` (Vault ${currentVaultIndex + 1} of ${totalVaults})`
      : "";

  switch (step) {
    case DepositStep.SIGN_POP:
      if (currentVaultIndex === null) {
        return "Preparing to create vaults... Please sign the split transaction in your Bitcoin wallet.";
      }
      return `Sign the proof-of-possession in your Bitcoin wallet${vaultProgress}.`;

    case DepositStep.SUBMIT_PEGIN:
      if (isWaiting) {
        return `Waiting for Ethereum transaction confirmation${vaultProgress}...`;
      }
      return `Sign the transaction in your Ethereum wallet${vaultProgress}.`;

    case DepositStep.SIGN_PAYOUTS:
      if (isWaiting) {
        return "Waiting for vault provider to prepare payout transactions...";
      }
      return `Sign the payout transactions in your Bitcoin wallet (${totalVaults} vaults).`;

    case DepositStep.BROADCAST_BTC:
      return "Broadcasting Bitcoin transactions...";

    case DepositStep.COMPLETED:
      return `Successfully created ${totalVaults} vaults!`;

    default:
      return "Processing...";
  }
}

/**
 * Check if modal can be closed at current step
 */
export function canCloseModal(
  step: DepositStep,
  error: string | null,
): boolean {
  // Can close on error or completion
  if (error || step === DepositStep.COMPLETED) {
    return true;
  }

  // Cannot close during active steps
  return false;
}
