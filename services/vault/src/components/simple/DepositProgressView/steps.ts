import type { StepperItem } from "@babylonlabs-io/core-ui";

import { DepositFlowStep } from "@/hooks/deposit/depositFlowSteps/types";
import type { PayoutSigningProgress } from "@/services/vault/vaultPayoutSignatureService";

export const TOTAL_VISUAL_STEPS = 11;

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
    case DepositFlowStep.COMPLETED:
      return TOTAL_VISUAL_STEPS + 1;
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
