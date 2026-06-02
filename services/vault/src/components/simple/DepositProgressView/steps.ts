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
  { title: COPY.deposit.groups.activateVault, startStep: 13, endStep: 15 },
];

/**
 * Visual step at which the deposit flow stops being shared across all vaults
 * in a split deposit. Everything through AWAIT_BTC_CONFIRMATION (visual step 6)
 * is a single shared Pre-PegIn broadcast; from SUBMIT_WOTS_KEYS onward each
 * vault progresses on its own VP-paced timeline and earns a dedicated column
 * in the multi-vault stepper.
 */
export const TRUNK_END_VISUAL_STEP = 6;

/**
 * Returns the per-vault current step for a single vault in a split deposit.
 *
 * The deposit flow signs vaults in readiness order (whichever the VP makes
 * ready first), so a non-active vault's progress cannot be inferred from its
 * index. Instead, each non-active vault's step is derived from what it has
 * ACTUALLY completed: `payoutSignedVaultIndices` ⊃ `wotsSubmittedVaultIndices`
 * (live flow only). A vault in neither set has not submitted WOTS yet (queued
 * or failed) and shows its earliest step. `currentVaultIndex` only identifies
 * the one active vault, which tracks the shared `currentStep`.
 */
export function derivePerVaultStep(
  currentStep: DepositFlowStep,
  currentVaultIndex: number | null,
  vaultIndex: number,
  payoutSignedVaultIndices?: ReadonlySet<number>,
  wotsSubmittedVaultIndices?: ReadonlySet<number>,
): DepositFlowStep {
  const currentVisual = getVisualStep(currentStep);

  // Trunk phase: every vault tracks the shared step.
  if (currentVisual <= TRUNK_END_VISUAL_STEP) return currentStep;

  // Between phases the index is briefly null — fall back to shared.
  if (currentVaultIndex === null) return currentStep;

  // The active vault tracks the shared step directly.
  if (vaultIndex === currentVaultIndex) return currentStep;

  // A non-active vault's step is derived from what it has ACTUALLY completed
  // (set membership), not from its index relative to the active vault. The live
  // flow signs vaults in readiness order, so a higher-indexed vault can finish
  // before a lower one — positional inference would mislabel it.
  if (payoutSignedVaultIndices?.has(vaultIndex)) {
    // Past payout signing. In the retrieve-secret/activation phase show it
    // heading into activation; earlier, it is awaiting VP verification.
    const retrieveVisual = getVisualStep(DepositFlowStep.RETRIEVE_SECRET);
    return currentVisual >= retrieveVisual
      ? DepositFlowStep.ACTIVATE_VAULT
      : DepositFlowStep.AWAIT_VP_VERIFICATION;
  }
  if (wotsSubmittedVaultIndices?.has(vaultIndex)) {
    return DepositFlowStep.AWAIT_PAYOUT_TRANSACTIONS;
  }
  // Not yet submitted WOTS (queued or failed) — show its real, earliest step
  // rather than inferring it forward.
  return DepositFlowStep.SUBMIT_WOTS_KEYS;
}

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
    case DepositFlowStep.RETRIEVE_SECRET:
      return 13;
    case DepositFlowStep.ACTIVATE_VAULT:
      return 14;
    case DepositFlowStep.AWAIT_ACTIVATION_CONFIRMATION:
      return 15;
    case DepositFlowStep.COMPLETED:
      return TOTAL_VISUAL_STEPS + 1;
    default: {
      const _exhaustive: never = currentStep;
      return _exhaustive;
    }
  }
}
