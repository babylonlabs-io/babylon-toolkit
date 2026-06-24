/**
 * SplitGroupedProgress
 *
 * Multi-vault variant of {@link GroupedProgress}. The deposit flow is shared
 * across all vaults until the Pre-PegIn broadcast confirms — from that point
 * each vault is on its own VP-paced timeline (WOTS submission, payout signing,
 * artifact download, activation) and can diverge by an hour or more. This
 * component renders the shared "Register deposit" group as a single trunk and
 * the remaining groups as one column per vault, reusing the same GroupBlock
 * (filled active-group card + collapsed header rows) as the single-vault stepper.
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
   * that region's own step — the trunk with `rawStep` (inline), each column
   * with its own per-vault step (stacked, since columns are narrow).
   */
  renderStepDetail?: (
    step: DepositFlowStep,
    opts: { stacked: boolean },
  ) => ReactNode;
  /**
   * Per-vault raw steps (resume path), indexed to match the columns. When
   * provided, each column renders its own vault's true polled state instead of
   * inferring it from array position.
   */
  perVaultSteps?: DepositFlowStep[];
}

/** One group list per vault, rendered as the new filled-card / header blocks. */
function VaultColumn({
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
    <div className="flex min-w-0 flex-1 flex-col">
      <Text
        as="span"
        variant="body2"
        className="mb-2 font-medium text-accent-primary"
      >
        {COPY.deposit.progress.splitVaultColumnLabel(vaultIndex + 1)}
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
                // Columns are narrow → stack each row's sub-counter.
                compact
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
}: SplitGroupedProgressProps) {
  // Shared trunk groups (Register deposit). Keep original 1-based numbers, hide
  // completed groups (they fold into the steps-completed pill).
  const trunkGroups = buildStepGroups(currentStep)
    .map((group, index) => ({ group, number: index + 1 }))
    .filter(
      ({ group }) =>
        group.endStep <= TRUNK_END_VISUAL_STEP && group.status !== "completed",
    );

  return (
    <div className="flex flex-col">
      {trunkGroups.map(({ group, number }) => (
        <div key={group.startStep} className="flex flex-col">
          <GroupBlock
            group={group}
            number={number}
            steps={steps}
            currentStep={currentStep}
            hasError={hasError}
            // Trunk is full-width → inline detail (e.g. the pegin-fee notice).
            activeStepDetail={renderStepDetail?.(rawStep, { stacked: false })}
          />
          <StepConnector />
        </div>
      ))}

      <div className="flex gap-6">
        {Array.from({ length: vaultCount }, (_, vaultIndex) => {
          // Resume path supplies each column's true step; the live flow infers
          // it from array position. `??` (not `||`) so step 0 isn't dropped.
          const vaultRawStep =
            perVaultSteps?.[vaultIndex] ??
            derivePerVaultStep(rawStep, currentVaultIndex, vaultIndex);
          const perVaultVisualStep = getVisualStep(vaultRawStep);
          const branchGroups = buildStepGroups(perVaultVisualStep)
            .map((group, index) => ({ group, number: index + 1 }))
            .filter(
              ({ group }) =>
                group.startStep > TRUNK_END_VISUAL_STEP &&
                group.status !== "completed",
            );

          return (
            <VaultColumn
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
                stacked: true,
              })}
            />
          );
        })}
      </div>
    </div>
  );
}
