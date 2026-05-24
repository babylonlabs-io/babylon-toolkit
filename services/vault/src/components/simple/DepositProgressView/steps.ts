import type { StepperItem } from "@babylonlabs-io/core-ui";

import { COPY } from "@/copy";
import { DepositFlowStep } from "@/hooks/deposit/depositFlowSteps/types";
import type { PayoutSigningProgress } from "@/services/vault/vaultPayoutSignatureService";
import type { PeginSigningProgress } from "@/services/vault/vaultTransactionService";

export function buildStepItems(
  progress: PayoutSigningProgress | null,
  peginProgress: PeginSigningProgress | null = null,
): StepperItem[] {
  const payoutCounter =
    progress?.phase === "claimers" && progress.total > 0
      ? COPY.deposit.steps.signingCounter(progress.completed, progress.total)
      : undefined;
  const graphCounter =
    progress?.phase === "graph" && progress.total > 0
      ? COPY.deposit.steps.signingCounter(progress.completed, progress.total)
      : undefined;

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
    { label: COPY.deposit.steps.confirmingDeposit },
    { label: COPY.deposit.steps.submitWotsKey },
    { label: COPY.deposit.steps.awaitPayoutTransactions },
    { label: COPY.deposit.steps.authenticateSession },
    { label: COPY.deposit.steps.signPayouts, description: payoutCounter },
    { label: COPY.deposit.steps.signRecoveryTxs, description: graphCounter },
    { label: COPY.deposit.steps.awaitVpVerification },
    { label: COPY.deposit.steps.downloadArtifact },
    { label: COPY.deposit.steps.retrieveSecret },
    { label: COPY.deposit.steps.revealSecret },
    { label: COPY.deposit.steps.awaitActivationConfirmation },
  ];
}

export const TOTAL_VISUAL_STEPS = buildStepItems(null).length;

/**
 * Logical groupings of the deposit flow. Each group covers a contiguous,
 * inclusive range of 1-based visual step numbers (the same numbering produced
 * by {@link getVisualStep}). The grouped progress UI expands only the group
 * containing the current step and collapses the rest.
 */
export interface StepGroup {
  title: string;
  /** First visual step in the group (1-based, inclusive). */
  startStep: number;
  /** Last visual step in the group (1-based, inclusive). */
  endStep: number;
}

export const STEP_GROUPS: StepGroup[] = [
  { title: COPY.deposit.groups.registerDeposit, startStep: 1, endStep: 6 },
  { title: COPY.deposit.groups.signWots, startStep: 7, endStep: 8 },
  { title: COPY.deposit.groups.signPayout, startStep: 9, endStep: 12 },
  { title: COPY.deposit.groups.activateVault, startStep: 13, endStep: 16 },
];

export type GroupStatus = "completed" | "active" | "upcoming";

export interface StepGroupView extends StepGroup {
  status: GroupStatus;
  /** How many of the group's steps are finished (0..totalInGroup). */
  completedInGroup: number;
  totalInGroup: number;
  /** True only for the active group — exactly one group expands at a time. */
  expanded: boolean;
}

/**
 * Resolve per-group view state from the current visual step. `currentStep` is a
 * 1-based visual step (see {@link getVisualStep}); on completion it is
 * `TOTAL_VISUAL_STEPS + 1`, which leaves every group `completed` and collapsed.
 */
export function buildStepGroups(currentStep: number): StepGroupView[] {
  return STEP_GROUPS.map((group) => {
    const totalInGroup = group.endStep - group.startStep + 1;

    let status: GroupStatus;
    if (currentStep > group.endStep) {
      status = "completed";
    } else if (currentStep >= group.startStep) {
      status = "active";
    } else {
      status = "upcoming";
    }

    const completedInGroup = Math.max(
      0,
      Math.min(totalInGroup, currentStep - group.startStep),
    );

    return {
      ...group,
      status,
      completedInGroup,
      totalInGroup,
      expanded: status === "active",
    };
  });
}

/**
 * Resolve the human-readable label for a deposit flow step, reusing the same
 * step definitions that drive the in-flow stepper (single source of truth).
 */
export function getStepLabel(step: DepositFlowStep): string {
  return buildStepItems(null)[getVisualStep(step) - 1]?.label ?? "";
}

/**
 * Progress-bar fill (0–1) for a deposit flow step. Reflects completed steps —
 * the current step is in progress, not done — so actionable steps never read as
 * 100%. The final step (awaiting activation confirmation) is the exception: all
 * actions are done, so the bar fills completely.
 */
export function getStepFillPercent(step: DepositFlowStep): number {
  const visualStep = getVisualStep(step);
  if (visualStep >= TOTAL_VISUAL_STEPS) return 1;
  return Math.max(0, visualStep - 1) / TOTAL_VISUAL_STEPS;
}

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
    case DepositFlowStep.AWAIT_PAYOUT_TRANSACTIONS:
      return 8;
    case DepositFlowStep.SIGN_AUTH_ANCHOR:
      return 9;
    case DepositFlowStep.SIGN_PAYOUTS:
      return 10;
    case DepositFlowStep.SIGN_DEPOSITOR_GRAPH:
      return 11;
    case DepositFlowStep.AWAIT_VP_VERIFICATION:
      return 12;
    case DepositFlowStep.ARTIFACT_DOWNLOAD:
      return 13;
    case DepositFlowStep.RETRIEVE_SECRET:
      return 14;
    case DepositFlowStep.ACTIVATE_VAULT:
      return 15;
    case DepositFlowStep.AWAIT_ACTIVATION_CONFIRMATION:
      return 16;
    case DepositFlowStep.COMPLETED:
      return TOTAL_VISUAL_STEPS + 1;
    default: {
      const _exhaustive: never = currentStep;
      return _exhaustive;
    }
  }
}
