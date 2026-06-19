/**
 * Structured soft warnings surfaced by the deposit flow, plus the rule for
 * when a non-terminal one becomes stale.
 *
 * Warnings used to be opaque strings appended to a list that only reset on a
 * fresh `executeDeposit` run — so a recoverable per-vault warning (e.g. a WOTS
 * readiness timeout) kept showing an orange alert even after the user resumed
 * and the step succeeded. Tagging each warning with the vault and the stage it
 * came from lets the continuation view drop it once that vault's live
 * `PeginState` shows it advanced past the warned stage.
 *
 * @module hooks/deposit/depositWarnings
 */

import type { Hex } from "viem";

import { DepositFlowStep } from "@/hooks/deposit/depositFlowSteps/types";
import {
  getPeginDisplayStep,
  type PeginState,
} from "@/models/peginStateMachine";

export type DepositWarningStage = "wots" | "payout" | "persistence";

export interface DepositWarning {
  /** Vault this warning is about; undefined for global (non-per-vault) warnings. */
  vaultId?: Hex;
  /** Which flow stage produced the warning. */
  stage: DepositWarningStage;
  /**
   * Terminal warnings describe a dead-end the continuation can never clear
   * (an expired vault or a terminal VP failure), so they always render.
   */
  terminal: boolean;
  /** Pre-rendered, copy.ts-authored message. */
  message: string;
}

/**
 * Whether a non-terminal per-vault warning is now stale because its vault
 * advanced past the stage it warned about.
 *
 * Forward-only: resolution is driven by the vault's position in the ordered
 * deposit flow (`getPeginDisplayStep`, the same mapping the progress bar uses),
 * never by the absence of the warned action. That action is also absent while
 * the VP poll is still loading and before the VP asks for the key, so keying on
 * absence would hide a step the user still owes. A `null` step means the vault
 * is terminal / expired / already activated, where the warned step is moot, so
 * that resolves too.
 *
 * Terminal and global (`persistence`) warnings, and an unknown live state,
 * never resolve.
 */
export function isDepositWarningResolved(
  warning: DepositWarning,
  peginState: PeginState | undefined,
): boolean {
  if (warning.terminal || warning.stage === "persistence" || !warning.vaultId) {
    return false;
  }
  if (!peginState) return false;

  // VP daemon ordering (btc-vault PegInStatus): WOTS (PendingDepositorWotsPK)
  // precedes payout signing (PendingDepositorSignatures), and the step enum
  // mirrors that order — a strictly-greater step means the stage is done.
  const step = getPeginDisplayStep(peginState);
  if (step === null) return true;
  if (warning.stage === "wots") {
    return step > DepositFlowStep.SUBMIT_WOTS_KEYS;
  }
  if (warning.stage === "payout") {
    return step > DepositFlowStep.SIGN_DEPOSITOR_GRAPH;
  }
  return false;
}
