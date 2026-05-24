/**
 * GroupedProgress
 *
 * Renders the deposit flow steps grouped into logical sections (see STEP_GROUPS).
 * Exactly one section — the one containing the current step — is expanded to
 * reveal its sub-steps; the rest collapse to a header with a completed counter.
 * Expansion is derived entirely from `currentStep` (no local state, no toggles).
 */

import type { StepperItem } from "@babylonlabs-io/core-ui";
import type { ReactNode } from "react";

import { GroupHeader } from "./GroupHeader";
import { StepConnector } from "./StepConnector";
import { StepRow, type StepRowState } from "./StepRow";
import { buildStepGroups } from "./steps";

interface GroupedProgressProps {
  steps: StepperItem[];
  /** 1-based visual step (TOTAL_VISUAL_STEPS + 1 when complete). */
  currentStep: number;
  /** Optional detail panel rendered inside the active step row. */
  activeStepDetail?: ReactNode;
}

export function GroupedProgress({
  steps,
  currentStep,
  activeStepDetail,
}: GroupedProgressProps) {
  const groups = buildStepGroups(currentStep);

  return (
    <div className="flex flex-col">
      {groups.map((group, groupIndex) => {
        const isLastGroup = groupIndex === groups.length - 1;
        const stepNumbers = Array.from(
          { length: group.totalInGroup },
          (_, i) => group.startStep + i,
        );

        return (
          <div key={group.startStep} className="flex flex-col">
            <GroupHeader
              number={groupIndex + 1}
              title={group.title}
              status={group.status}
              completedInGroup={group.completedInGroup}
              totalInGroup={group.totalInGroup}
            />

            {group.expanded && (
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
                        label={step.label}
                        description={step.description}
                        detail={activeStepDetail}
                        hasNext={subIndex < stepNumbers.length - 1}
                      />
                    </div>
                  );
                })}
              </div>
            )}

            {!isLastGroup && <StepConnector />}
          </div>
        );
      })}
    </div>
  );
}
