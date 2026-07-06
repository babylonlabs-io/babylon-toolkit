/**
 * GroupBlock
 *
 * Renders one step group with the deposit-progress design: the active group
 * expands into a filled card (header → divider → sub-steps), while a collapsed
 * (upcoming) group renders as a single header row. Shared by the single-vault
 * stepper ({@link GroupedProgress}) and each lane of the split stepper
 * ({@link SplitGroupedProgress}) so both look identical.
 */

import type { StepperItem } from "@babylonlabs-io/core-ui";
import type { ReactNode } from "react";

import { GroupHeader } from "./GroupHeader";
import { StepRow, type StepRowState } from "./StepRow";
import type { StepGroupView } from "./steps";

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
}

export function GroupBlock({
  group,
  number,
  steps,
  currentStep,
  hasError = false,
  activeStepDetail,
  compact = false,
}: GroupBlockProps) {
  if (!group.expanded) {
    return (
      <GroupHeader
        number={number}
        title={group.title}
        status={group.status}
        completedInGroup={group.completedInGroup}
        totalInGroup={group.totalInGroup}
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
        />
        <div className="border-t border-secondary-strokeLight" />
        <div className="flex flex-col gap-2 px-2">
          {stepNumbers.map((globalStepNum, subIndex) => {
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
                hasNext={subIndex < stepNumbers.length - 1}
                compact={compact}
                inCard
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}
