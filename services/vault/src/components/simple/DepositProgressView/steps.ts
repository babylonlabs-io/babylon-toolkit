import type { StepperItem } from "@babylonlabs-io/core-ui";

import { COPY } from "@/copy";
import { DepositFlowStep } from "@/hooks/deposit/depositFlowSteps/types";
import type { PayoutSigningProgress } from "@/services/vault/vaultPayoutSignatureService";
import type { PeginSigningProgress } from "@/services/vault/vaultTransactionService";

export const EXPECTED_CONFIRMATION_MINUTES = 15;

export function buildStepItems(
  progress: PayoutSigningProgress | null,
  peginProgress: PeginSigningProgress | null = null,
): StepperItem[] {
  const payoutTotal = progress?.totalClaimers ?? 0;
  const payoutCompleted = progress?.completed ?? 0;

  // Only surface the (x of n) counter for split (multi-vault) deposits;
  // a single-vault deposit signs one peg-in tx and needs no sub-counter.
  const peginTotal = peginProgress?.total ?? 0;
  const peginCounter =
    peginTotal > 1
      ? COPY.deposit.steps.signingCounter(
          peginProgress?.completed ?? 0,
          peginTotal,
        )
      : undefined;

  return [
    { label: COPY.deposit.steps.generateSecret },
    { label: COPY.deposit.steps.signPeginBtc, description: peginCounter },
    { label: COPY.deposit.steps.signLinkProofs },
    { label: COPY.deposit.steps.signAndBroadcastEth },
    { label: COPY.deposit.steps.signAndBroadcastPrePegin },
    {
      label: COPY.deposit.steps.awaitBtcConfirmation,
      description: COPY.deposit.steps.awaitBtcConfirmationDuration(
        EXPECTED_CONFIRMATION_MINUTES,
      ),
    },
    { label: COPY.deposit.steps.submitWotsKey },
    { label: COPY.deposit.steps.authenticateSession },
    {
      label: COPY.deposit.steps.signPayouts,
      description:
        payoutTotal > 0
          ? COPY.deposit.steps.signingCounter(payoutCompleted, payoutTotal)
          : undefined,
    },
    { label: COPY.deposit.steps.downloadArtifact },
    { label: COPY.deposit.steps.revealSecret },
  ];
}

export const TOTAL_VISUAL_STEPS = buildStepItems(null).length;

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
    default: {
      const _exhaustive: never = currentStep;
      return _exhaustive;
    }
  }
}
