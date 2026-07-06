/**
 * DemoActivationContent (dev / QA only — gated behind NEXT_PUBLIC_FF_GOD_MODE_PANEL).
 *
 * Stand-in for ResumeActivationContent on the god-mode activation walk. It
 * renders the SAME DepositProgressView "Activating vault" step, but instead of
 * the real activation machinery (wallet signing, vault-registry reads, HTLC
 * secret derivation, on-chain submission — none of which a mock vault can do)
 * it simulates the submission: after a short beat it advances the demo store to
 * the optimistic VERIFIED+CONFIRMED state. That flips the hosting
 * PostDepositContinuationView to the real VaultActivatedView success screen —
 * the identical structural transition production drives via
 * `setOptimisticStatus(CONFIRMED)`, just sourced from the demo store.
 *
 * Never mounted for a real vault id: PostDepositContinuationView only selects
 * this component when the id is a member of the demo store (see its
 * `demoVaultIds` prop), and the whole module is tree-shaken from production
 * builds behind `import.meta.env.DEV`.
 */

import { useEffect } from "react";

import { computeDepositDerivedState } from "@/components/deposit/DepositSignModal/depositStepHelpers";
import { DepositProgressView } from "@/components/simple/DepositProgressView";
import { DepositFlowStep } from "@/hooks/deposit/depositFlowSteps";
import { useSplitVaultProgress } from "@/hooks/deposit/useSplitVaultProgress";
import type { VaultActivity } from "@/types/activity";

import { submitDemoVaultActivation } from "./demoDeposit";

/** Simulated wallet-signing + tx-submission beat before the store advances, so
 *  the "Activating vault" progress is visible rather than flashing past. */
const DEMO_ACTIVATION_SUBMIT_MS = 1800;

interface DemoActivationContentProps {
  activity: VaultActivity;
  /** Sibling vault IDs sharing this demo batch (drives the split columns). */
  siblingVaultIds?: string[];
  onClose: () => void;
}

export default function DemoActivationContent({
  activity,
  siblingVaultIds,
  onClose,
}: DemoActivationContentProps) {
  // Advance the demo store after the beat. Cleared on unmount (dialog closed
  // mid-sim), so a late fire can't mutate state after teardown; StrictMode's
  // setup→cleanup→setup leaves exactly one live timer.
  useEffect(() => {
    const timer = setTimeout(
      () => submitDemoVaultActivation(activity.id),
      DEMO_ACTIVATION_SUBMIT_MS,
    );
    return () => clearTimeout(timer);
  }, [activity.id]);

  const renderStep = DepositFlowStep.ACTIVATE_VAULT;
  // Matches ResumeActivationContent's `activating` frame: processing spinner,
  // not a background wait. The store advance unmounts this before COMPLETED.
  const derived = computeDepositDerivedState(renderStep, true, false, false);
  const { vaultCount, currentVaultIndex, perVaultSteps } =
    useSplitVaultProgress(siblingVaultIds, activity.id, renderStep);

  return (
    <DepositProgressView
      currentStep={renderStep}
      error={null}
      isComplete={derived.isComplete}
      isProcessing={derived.isProcessing}
      canClose={derived.canClose}
      canContinueInBackground={derived.canContinueInBackground}
      payoutSigningProgress={null}
      peginSigningProgress={null}
      vaultCount={vaultCount}
      currentVaultIndex={currentVaultIndex}
      perVaultSteps={perVaultSteps}
      onClose={onClose}
    />
  );
}
