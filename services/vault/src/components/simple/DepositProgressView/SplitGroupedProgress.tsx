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
  /** Optional detail panel rendered inside the active step row (trunk only). */
  activeStepDetail?: ReactNode;
}

function StepList({
  group,
  steps,
  currentStep,
  activeStepDetail,
}: {
  group: StepGroupView;
  steps: StepperItem[];
  currentStep: number;
  activeStepDetail?: ReactNode;
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
}: {
  vaultIndex: number;
  branchGroups: StepGroupView[];
  steps: StepperItem[];
  perVaultVisualStep: number;
  /** Index offset so per-vault group letters continue from the trunk (B, C, D, …). */
  groupNumberOffset: number;
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
  activeStepDetail,
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
              activeStepDetail={activeStepDetail}
            />
          )}
          <StepConnector />
        </div>
      ))}

      <div className="flex gap-6">
        {Array.from({ length: vaultCount }, (_, vaultIndex) => {
          const vaultRawStep = derivePerVaultStep(
            rawStep,
            currentVaultIndex,
            vaultIndex,
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
            />
          );
        })}
      </div>
    </div>
  );
}
