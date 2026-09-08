/**
 * SplitGroupedProgress
 *
 * Multi-vault variant of {@link GroupedProgress}. The deposit flow is shared
 * across all vaults until the Pre-PegIn broadcast confirms — from that point
 * each vault is on its own VP-paced timeline (WOTS submission, payout signing,
 * artifact download, activation) and can diverge by an hour or more. This
 * component renders the shared "Register deposit" group as a single trunk and
 * the remaining groups as one full-width lane per vault, stacked one above the
 * other, reusing the same GroupBlock as the single-vault stepper. Each region
 * shows one group: the trunk while the shared step is still inside it, then one
 * per lane — the group holding that vault's own step, clamped so a queued vault
 * shows its next group and a finished one its last.
 */

import type { StepperItem } from "@babylonlabs-io/core-ui";
import { Text } from "@babylonlabs-io/core-ui";
import type { ReactNode } from "react";

import { COPY } from "@/copy";
import { DepositFlowStep } from "@/hooks/deposit/depositFlowSteps/types";

import { GroupBlock } from "./GroupBlock";
import {
  buildStepGroups,
  derivePerVaultStep,
  getVisualStep,
  groupContainsStep,
  TOTAL_VISUAL_STEPS,
  TRUNK_END_VISUAL_STEP,
} from "./steps";

interface SplitGroupedProgressProps {
  steps: StepperItem[];
  /** Shared current step (1-based visual step). */
  currentStep: number;
  /** Number of vaults in the deposit (must be >= 2 to render the split). */
  vaultCount: number;
  /** Which vault is the "active" one for the per-vault loops, or null. */
  currentVaultIndex: number | null;
  /** Underlying DepositFlowStep, used to derive per-vault progression. */
  rawStep: DepositFlowStep;
  /** When true, the current step failed — render it as an error, not active. */
  hasError?: boolean;
  /**
   * Resolves the detail panel for a given step. Called once per region with
   * that region's own step — the trunk with `rawStep`, each vault lane with
   * its own per-vault step.
   */
  renderStepDetail?: (
    step: DepositFlowStep,
    opts?: { isActiveVault?: boolean },
  ) => ReactNode;
  /**
   * Per-vault raw steps (resume path), indexed to match the lanes. When
   * provided, each lane renders its own vault's true polled state instead
   * of inferring it from array position.
   */
  perVaultSteps?: DepositFlowStep[];
  /**
   * False in the pre-entry state. Lanes mirroring the flow's own un-started
   * step stay collapsed; sibling lanes keep expanding off their polled state
   * (see the per-lane gate below).
   */
  started?: boolean;
  /**
   * Pre-sign entry panel. Goes on the shared trunk only — one Pre-PegIn
   * transaction, one fee rate, however many vaults the deposit splits into.
   */
  preSignDetail?: ReactNode;
}

/** One vault's lane: its label plus the group holding that vault's own step. */
function VaultLane({
  vaultIndex,
  branchGroups,
  steps,
  perVaultVisualStep,
  hasError,
  activeStepDetail,
}: {
  vaultIndex: number;
  branchGroups: {
    group: ReturnType<typeof buildStepGroups>[number];
    number: number;
  }[];
  steps: StepperItem[];
  perVaultVisualStep: number;
  hasError: boolean;
  activeStepDetail?: ReactNode;
}) {
  if (branchGroups.length === 0) return null;

  return (
    <div className="flex flex-col">
      <Text
        as="span"
        variant="body1"
        className="mb-2 font-medium text-accent-primary"
      >
        {COPY.deposit.progress.splitVaultLabel(vaultIndex + 1)}
      </Text>
      <div className="flex flex-col">
        {branchGroups.map(({ group, number }) => (
          <GroupBlock
            key={group.startStep}
            group={group}
            number={number}
            steps={steps}
            currentStep={perVaultVisualStep}
            hasError={hasError}
            activeStepDetail={activeStepDetail}
          />
        ))}
      </div>
    </div>
  );
}

export function SplitGroupedProgress({
  steps,
  currentStep,
  vaultCount,
  currentVaultIndex,
  rawStep,
  hasError = false,
  renderStepDetail,
  perVaultSteps,
  started = true,
  preSignDetail,
}: SplitGroupedProgressProps) {
  // Shared trunk (Register deposit): rendered only while the shared step is
  // still inside it. Original 1-based numbers are kept so the group reads the
  // same as in the single-vault stepper.
  const trunkGroups = buildStepGroups(currentStep, started)
    .map((group, index) => ({ group, number: index + 1 }))
    .filter(
      ({ group }) =>
        group.endStep <= TRUNK_END_VISUAL_STEP &&
        groupContainsStep(group, currentStep),
    );
  const trunkVisible = trunkGroups.length > 0;

  // The trunk and each vault lane are full width and stacked, set apart by the
  // same gap.
  return (
    <div className="flex flex-col gap-6">
      {trunkGroups.map(({ group, number }) => (
        <GroupBlock
          key={group.startStep}
          group={group}
          number={number}
          steps={steps}
          currentStep={currentStep}
          hasError={hasError}
          activeStepDetail={renderStepDetail?.(rawStep)}
          preSignDetail={preSignDetail}
        />
      ))}

      {!trunkVisible &&
        Array.from({ length: vaultCount }, (_, vaultIndex) => {
          // Resume path supplies each lane's true step; the live flow infers
          // it from array position. `??` (not `||`) so step 0 isn't dropped.
          const vaultRawStep =
            perVaultSteps?.[vaultIndex] ??
            derivePerVaultStep(rawStep, currentVaultIndex, vaultIndex);
          const perVaultVisualStep = getVisualStep(vaultRawStep);
          // The pre-entry gate applies only to lanes mirroring the flow's
          // own un-started step. A sibling lane on a different step is driven
          // by its own polled state — its expansion (and any live detail
          // panel, e.g. the confirmation-depth counter) reflects a genuinely
          // running remote process, not the action awaiting this click.
          const laneStarted = started || vaultRawStep !== rawStep;
          // Every lane must still show a group: the flow parks queued vaults on
          // the trunk's last step, and a finished vault sits past the last one.
          // Status stays the lane's real step.
          const laneGroupStep = Math.min(
            Math.max(perVaultVisualStep, TRUNK_END_VISUAL_STEP + 1),
            TOTAL_VISUAL_STEPS,
          );
          const branchGroups = buildStepGroups(perVaultVisualStep, laneStarted)
            .map((group, index) => ({ group, number: index + 1 }))
            .filter(
              ({ group }) =>
                group.startStep > TRUNK_END_VISUAL_STEP &&
                groupContainsStep(group, laneGroupStep),
            );

          return (
            <VaultLane
              key={vaultIndex}
              vaultIndex={vaultIndex}
              branchGroups={branchGroups}
              steps={steps}
              perVaultVisualStep={perVaultVisualStep}
              // Only the failing vault's own lane shows the error — gate on the
              // active vault index, not just the visual step, since two lanes can
              // sit on the same step while only the current vault was rejected.
              hasError={
                hasError &&
                vaultIndex === currentVaultIndex &&
                perVaultVisualStep === currentStep
              }
              activeStepDetail={renderStepDetail?.(vaultRawStep, {
                isActiveVault: vaultIndex === currentVaultIndex,
              })}
            />
          );
        })}
    </div>
  );
}
