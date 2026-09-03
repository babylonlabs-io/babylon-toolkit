/**
 * GroupBlock
 *
 * Renders one step group with the deposit-progress design: the active group
 * expands into a filled card (header → divider → sub-steps), while an
 * un-started (pre-entry) group renders as a single header row. Shared by the
 * single-vault stepper ({@link GroupedProgress}) and each lane of the split
 * stepper ({@link SplitGroupedProgress}) so both look identical.
 */

import type { StepperItem } from "@babylonlabs-io/core-ui";
import type { ReactNode } from "react";

import { DepositFlowStep } from "@/hooks/deposit/depositFlowSteps/types";

import { GroupHeader } from "./GroupHeader";
import { StepRow, type StepRowState } from "./StepRow";
import { getVisualStep, groupContainsStep, type StepGroupView } from "./steps";

/** The step whose transaction the pre-sign fee rate pays for. */
const PRE_PEGIN_VISUAL_STEP = getVisualStep(
  DepositFlowStep.BROADCAST_PRE_PEGIN,
);

interface GroupBlockProps {
  group: StepGroupView;
  /** 1-based group number shown in the circle (original group position). */
  number: number;
  steps: StepperItem[];
  /** Current visual step for this lane (shared trunk or per-vault column). */
  currentStep: number;
  /** When true, this lane's current step failed — render it as an error. */
  hasError?: boolean;
  /** Detail panel rendered under the active sub-step. */
  activeStepDetail?: ReactNode;
  /** Narrow per-vault column → stack each row's sub-counter below its label. */
  compact?: boolean;
  /**
   * Pre-sign entry panel (the fee-rate selector). Passed only while the flow
   * has not started; renders inside this group's card under the Pre-PegIn
   * step — the transaction the rate pays for — instead of the collapsed
   * header. Ignored by groups that don't contain that step.
   */
  preSignDetail?: ReactNode;
}

export function GroupBlock({
  group,
  number,
  steps,
  currentStep,
  hasError = false,
  activeStepDetail,
  compact = false,
  preSignDetail,
}: GroupBlockProps) {
  // Pre-sign entry: this group owns the Pre-PegIn step, so it opens into the
  // card and shows that one row with the fee selector rendered below it as a
  // sibling. The other rows stay hidden — the entry screen is about the one
  // decision left to make, not the whole group. The row reads active even
  // though nothing is running yet.
  const showPreSignDetail =
    !group.expanded &&
    Boolean(preSignDetail) &&
    group.startStep <= PRE_PEGIN_VISUAL_STEP &&
    PRE_PEGIN_VISUAL_STEP <= group.endStep;

  const headerHasError = hasError && groupContainsStep(group, currentStep);

  if (!group.expanded && !showPreSignDetail) {
    return (
      <GroupHeader
        number={number}
        title={group.title}
        status={group.status}
        completedInGroup={group.completedInGroup}
        totalInGroup={group.totalInGroup}
        hasError={headerHasError}
      />
    );
  }

  const stepNumbers = Array.from(
    { length: group.totalInGroup },
    (_, i) => group.startStep + i,
  );

  return (
    <div className="rounded-2xl bg-secondary-highlight p-4">
      <div className="flex flex-col gap-3">
        <GroupHeader
          number={number}
          title={group.title}
          status={group.status}
          completedInGroup={group.completedInGroup}
          totalInGroup={group.totalInGroup}
          hasError={headerHasError}
        />
        <div className="border-t border-secondary-strokeLight" />
        <div className="flex flex-col gap-2 px-2">
          {showPreSignDetail ? (
            <>
              <StepRow
                state={headerHasError ? "error" : "active"}
                number={PRE_PEGIN_VISUAL_STEP - group.startStep + 1}
                ariaNumber={PRE_PEGIN_VISUAL_STEP}
                label={steps[PRE_PEGIN_VISUAL_STEP - 1]?.label ?? ""}
                compact={compact}
              />
              {preSignDetail}
            </>
          ) : (
            stepNumbers.map((globalStepNum, subIndex) => {
              const step = steps[globalStepNum - 1];
              if (!step) return null;

              const state: StepRowState =
                globalStepNum < currentStep
                  ? "completed"
                  : globalStepNum === currentStep
                    ? hasError
                      ? "error"
                      : "active"
                    : "pending";

              return (
                <StepRow
                  key={globalStepNum}
                  state={state}
                  number={subIndex + 1}
                  ariaNumber={globalStepNum}
                  label={step.label}
                  description={step.description}
                  detail={activeStepDetail}
                  compact={compact}
                />
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
