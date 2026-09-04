/**
 * SplitGroupedProgress
 *
 * Multi-vault variant of {@link GroupedProgress}. The deposit flow is shared
 * across all vaults until the Pre-PegIn broadcast confirms — from that point
 * each vault is on its own VP-paced timeline (WOTS submission, payout signing,
 * artifact download, activation) and can diverge by an hour or more. This
 * component renders the shared "Register deposit" group as a single trunk and
 * the remaining groups as one full-width lane per vault, stacked one above
 * the other, reusing the same GroupBlock (filled active-group card + collapsed
 * header rows) as the single-vault stepper.
 */

import type { StepperItem } from "@babylonlabs-io/core-ui";
import { Text } from "@babylonlabs-io/core-ui";
import type { ReactNode } from "react";

import { COPY } from "@/copy";
import { DepositFlowStep } from "@/hooks/deposit/depositFlowSteps/types";

import { GroupBlock } from "./GroupBlock";
import { StepConnector } from "./StepConnector";
import {
  buildStepGroups,
  derivePerVaultStep,
  getVisualStep,
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

/** One group list per vault, rendered as the new filled-card / header blocks. */
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
        {branchGroups.map(({ group, number }, idx) => {
          const isLast = idx === branchGroups.length - 1;
          return (
            <div key={group.startStep} className="flex flex-col">
              <GroupBlock
                group={group}
                number={number}
                steps={steps}
                currentStep={perVaultVisualStep}
                hasError={hasError}
                activeStepDetail={activeStepDetail}
              />
              {!isLast && <StepConnector />}
            </div>
          );
        })}
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
  // Shared trunk groups (Register deposit). Keep original 1-based numbers, hide
  // completed groups (they fold into the steps-completed pill).
  const trunkGroups = buildStepGroups(currentStep, started)
    .map((group, index) => ({ group, number: index + 1 }))
    .filter(
      ({ group }) =>
        group.endStep <= TRUNK_END_VISUAL_STEP && group.status !== "completed",
    );

  // Connectors join groups within a region; the trunk and each vault lane are
  // set apart by the same gap that separates the lanes from one another.
  return (
    <div className="flex flex-col gap-6">
      {trunkGroups.length > 0 && (
        <div className="flex flex-col">
          {trunkGroups.map(({ group, number }, idx) => (
            <div key={group.startStep} className="flex flex-col">
              <GroupBlock
                group={group}
                number={number}
                steps={steps}
                currentStep={currentStep}
                hasError={hasError}
                activeStepDetail={renderStepDetail?.(rawStep)}
                preSignDetail={preSignDetail}
              />
              {idx < trunkGroups.length - 1 && <StepConnector />}
            </div>
          ))}
        </div>
      )}

      {Array.from({ length: vaultCount }, (_, vaultIndex) => {
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
        const branchGroups = buildStepGroups(perVaultVisualStep, laneStarted)
          .map((group, index) => ({ group, number: index + 1 }))
          .filter(
            ({ group }) =>
              group.startStep > TRUNK_END_VISUAL_STEP &&
              group.status !== "completed",
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
