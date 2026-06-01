/**
 * Split-vault progress derivation for the resume path.
 *
 * A batched deposit funds several vaults from one Pre-PegIn; after broadcast
 * each vault advances on its own VP-paced timeline, so the multistepper columns
 * genuinely diverge (one already activated, another still on WOTS). Given the
 * sibling vault IDs (in column order), the vault this modal is currently
 * driving, and that vault's live render step, this resolves:
 *  - `vaultCount` / `currentVaultIndex` for the multi-column layout, and
 *  - `perVaultSteps`, one step per column derived from each sibling's OWN
 *    polled state (the active column uses the finer-grained live step).
 *
 * The live initial-deposit flow does NOT use this: there the vaults aren't
 * registered/polled yet and progression is strictly sequential, so the view
 * falls back to position-based inference (`derivePerVaultStep`). Using polled
 * state there would be wrong; using sequential inference on resume is wrong —
 * hence the two paths.
 */

import {
  type DepositPollingResult,
  usePeginPolling,
} from "@/context/deposit/PeginPollingContext";
import { DepositFlowStep } from "@/hooks/deposit/depositFlowSteps";
import { logger } from "@/infrastructure";
import { getPeginDisplayStep } from "@/models/peginStateMachine";

export interface SplitVaultProgress {
  vaultCount: number;
  /** Active column index, or null when the deposit isn't a split / can't be resolved. */
  currentVaultIndex: number | null;
  /** Per-column steps (resume path). Undefined for standalone deposits. */
  perVaultSteps?: DepositFlowStep[];
}

type GetPollingResult = (depositId: string) => DepositPollingResult | undefined;

/**
 * Pure derivation. Used directly by callers that already hold a
 * `getPollingResult` (e.g. PostDepositContinuationView, which computes its
 * active vault after early returns where a hook can't run).
 */
export function deriveSplitVaultProgress(
  getPollingResult: GetPollingResult,
  siblingVaultIds: string[] | undefined,
  activeVaultId: string,
  activeStep: DepositFlowStep,
): SplitVaultProgress {
  // A standalone deposit (or a single-element batch) renders the original
  // single-column layout — no per-vault steps needed.
  if (!siblingVaultIds || siblingVaultIds.length <= 1) {
    return { vaultCount: 1, currentVaultIndex: null };
  }

  const currentVaultIndex = siblingVaultIds.indexOf(activeVaultId);

  // The active vault must be one of its own siblings. A miss is a mis-wired
  // prop, not transient state — surface it (No Silent Fallbacks) rather than
  // quietly collapsing the active column, but don't crash the resume modal
  // over a display concern; fall back to the columns with no active highlight.
  if (currentVaultIndex === -1) {
    logger.error(
      new Error("deriveSplitVaultProgress: active vault not in sibling set"),
      { data: { activeVaultId, siblingVaultIds } },
    );
    return { vaultCount: siblingVaultIds.length, currentVaultIndex: null };
  }

  const perVaultSteps = siblingVaultIds.map((id, index) => {
    // The active column tracks the live render step (e.g. mid-signing), which
    // is finer-grained than the polled display step.
    if (index === currentVaultIndex) return activeStep;
    const state = getPollingResult(id)?.peginState;
    // A sibling whose display step can't be resolved (warning/terminal/loading)
    // falls back to the active step so its column still renders a sane row.
    return (state ? getPeginDisplayStep(state) : null) ?? activeStep;
  });

  return {
    vaultCount: siblingVaultIds.length,
    currentVaultIndex,
    perVaultSteps,
  };
}

/** Hook wrapper for components that resolve their active vault up front. */
export function useSplitVaultProgress(
  siblingVaultIds: string[] | undefined,
  activeVaultId: string,
  activeStep: DepositFlowStep,
): SplitVaultProgress {
  const { getPollingResult } = usePeginPolling();
  return deriveSplitVaultProgress(
    getPollingResult,
    siblingVaultIds,
    activeVaultId,
    activeStep,
  );
}
