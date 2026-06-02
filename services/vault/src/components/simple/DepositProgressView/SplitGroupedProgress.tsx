/**
 * SplitGroupedProgress
 *
 * Multi-vault variant of {@link GroupedProgress}. The deposit flow is shared
 * across all vaults until the Pre-PegIn broadcast confirms — from that point
 * each vault is on its own VP-paced timeline (WOTS submission, payout signing,
 * artifact download, activation) and can diverge by an hour or more. This
 * component renders the shared "Register deposit" group as a single trunk and
 * the remaining groups as one column per vault, so the UI matches the topology
 * of the underlying flow.
 */

import { Text, type StepperItem } from "@babylonlabs-io/core-ui";
import type { ReactNode } from "react";

import { COPY } from "@/copy";
import { DepositFlowStep } from "@/hooks/deposit/depositFlowSteps/types";

import { GroupHeader } from "./GroupHeader";
import { StepConnector } from "./StepConnector";
import { StepRow, type StepRowState } from "./StepRow";
import {
  buildStepGroups,
  derivePerVaultStep,
  getVisualStep,
  TRUNK_END_VISUAL_STEP,
  type StepGroupView,
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
  /**
   * Resolves the detail panel for a given step. Called once per region with
   * that region's own step — the trunk with `rawStep` (inline), each column
   * with its own per-vault step (stacked, since columns are narrow) — so two
   * columns parked on the same shared wait both render it and diverged columns
   * each render their own. `StepRow` only shows it on the active row.
   */
  renderStepDetail?: (
    step: DepositFlowStep,
    opts: { stacked: boolean },
  ) => ReactNode;
  /**
   * Per-vault raw steps (resume path), indexed to match the columns. When
   * provided, each column renders its own vault's true polled state instead of
   * inferring it from array position. Omit for the live sequential flow, where
   * {@link derivePerVaultStep} handles the inference.
   */
  perVaultSteps?: DepositFlowStep[];
  /**
   * Live-flow only: vault indices whose payouts actually signed, passed to
   * {@link derivePerVaultStep} so a skipped sibling isn't inferred as signed.
   */
  payoutSignedVaultIndices?: ReadonlySet<number>;
}

function StepList({
  group,
  steps,
  currentStep,
  activeStepDetail,
  compact = false,
}: {
  group: StepGroupView;
  steps: StepperItem[];
  currentStep: number;
  activeStepDetail?: ReactNode;
  /** Stack each row's sub-counter below its label (narrow per-vault columns). */
  compact?: boolean;
}) {
  const stepNumbers = Array.from(
    { length: group.totalInGroup },
    (_, i) => group.startStep + i,
  );

  return (
    <div className="ml-[15px] flex flex-col border-l-2 border-secondary-strokeDark py-2 pl-6">
      {stepNumbers.map((globalStepNum, subIndex) => {
        const step = steps[globalStepNum - 1];
        if (!step) return null;

        const displayNumber = subIndex + 1;

        const state: StepRowState =
          globalStepNum < currentStep
            ? "completed"
            : globalStepNum === currentStep
              ? "active"
              : "pending";

        return (
          <div key={globalStepNum}>
            {subIndex > 0 && <StepConnector />}
            <StepRow
              state={state}
              number={displayNumber}
              ariaNumber={globalStepNum}
              label={step.label}
              description={step.description}
              detail={activeStepDetail}
              hasNext={subIndex < stepNumbers.length - 1}
              compact={compact}
            />
          </div>
        );
      })}
    </div>
  );
}

function VaultColumn({
  vaultIndex,
  branchGroups,
  steps,
  perVaultVisualStep,
  groupNumberOffset,
  activeStepDetail,
}: {
  vaultIndex: number;
  branchGroups: StepGroupView[];
  steps: StepperItem[];
  perVaultVisualStep: number;
  /** Index offset so per-vault group letters continue from the trunk (B, C, D, …). */
  groupNumberOffset: number;
  /** Detail panel for this column's active step. Only the active vault's
   *  column receives it — siblings show no wait/confirmation detail. */
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
        {branchGroups.map((group, idx) => {
          const isLast = idx === branchGroups.length - 1;
          return (
            <div key={group.startStep} className="flex flex-col">
              <GroupHeader
                number={groupNumberOffset + idx + 1}
                title={group.title}
                status={group.status}
                completedInGroup={group.completedInGroup}
                totalInGroup={group.totalInGroup}
              />
              {group.expanded && (
                <StepList
                  group={group}
                  steps={steps}
                  currentStep={perVaultVisualStep}
                  activeStepDetail={activeStepDetail}
                  // Columns are narrow → stack each row's sub-counter.
                  compact
                />
              )}
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
  renderStepDetail,
  perVaultSteps,
  payoutSignedVaultIndices,
}: SplitGroupedProgressProps) {
  const trunkGroups = buildStepGroups(currentStep).filter(
    (group) => group.endStep <= TRUNK_END_VISUAL_STEP,
  );

  return (
    <div className="flex flex-col">
      {trunkGroups.map((group, groupIndex) => (
        <div key={group.startStep} className="flex flex-col">
          <GroupHeader
            number={groupIndex + 1}
            title={group.title}
            status={group.status}
            completedInGroup={group.completedInGroup}
            totalInGroup={group.totalInGroup}
          />
          {group.expanded && (
            <StepList
              group={group}
              steps={steps}
              currentStep={currentStep}
              // Trunk is full-width → inline detail (e.g. the pegin-fee notice
              // during live signing).
              activeStepDetail={renderStepDetail?.(rawStep, { stacked: false })}
            />
          )}
          <StepConnector />
        </div>
      ))}

      <div className="flex gap-6">
        {Array.from({ length: vaultCount }, (_, vaultIndex) => {
          // Resume path supplies each column's true step from its own polled
          // state; the live flow infers it from array position. `??` (not `||`)
          // so step 0 (DERIVE_VAULT_SECRET) isn't treated as missing.
          const vaultRawStep =
            perVaultSteps?.[vaultIndex] ??
            derivePerVaultStep(
              rawStep,
              currentVaultIndex,
              vaultIndex,
              payoutSignedVaultIndices,
            );
          const perVaultVisualStep = getVisualStep(vaultRawStep);
          const perVaultBranchGroups = buildStepGroups(
            perVaultVisualStep,
          ).filter((group) => group.startStep > TRUNK_END_VISUAL_STEP);

          return (
            <VaultColumn
              key={vaultIndex}
              vaultIndex={vaultIndex}
              branchGroups={perVaultBranchGroups}
              steps={steps}
              perVaultVisualStep={perVaultVisualStep}
              groupNumberOffset={trunkGroups.length}
              // Each column resolves its detail from its OWN step (stacked for
              // the narrow column). `StepRow` renders it only on the active row,
              // so a column shows the panel exactly when its own active step
              // produces one — including two columns sharing the same wait.
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
