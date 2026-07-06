/**
 * GroupedProgress
 *
 * Renders the deposit flow steps grouped into logical sections (see STEP_GROUPS).
 * Completed groups are hidden — they fold into the "X of N steps completed" pill
 * — so only the active and upcoming groups render. The active group expands into
 * a filled card revealing its sub-steps; upcoming groups collapse to a header
 * row. Visibility and expansion are derived entirely from `currentStep`.
 */

import type { StepperItem } from "@babylonlabs-io/core-ui";
import type { ReactNode } from "react";

import { GroupBlock } from "./GroupBlock";
import { StepConnector } from "./StepConnector";
import { buildStepGroups } from "./steps";

interface GroupedProgressProps {
  steps: StepperItem[];
  /** 1-based visual step (TOTAL_VISUAL_STEPS + 1 when complete). */
  currentStep: number;
  /** Optional detail panel rendered inside the active step row. */
  activeStepDetail?: ReactNode;
  /** When true, the current step failed — render it as an error, not active. */
  hasError?: boolean;
}

export function GroupedProgress({
  steps,
  currentStep,
  activeStepDetail,
  hasError = false,
}: GroupedProgressProps) {
  const groups = buildStepGroups(currentStep);

  // Completed groups are represented by the steps-completed pill, so hide their
  // rows. Original 1-based group numbers are preserved (after group 1 finishes,
  // the active group still reads "2") to match the design.
  const visibleGroups = groups
    .map((group, index) => ({ group, number: index + 1 }))
    .filter(({ group }) => group.status !== "completed");

  return (
    <div className="flex flex-col">
      {visibleGroups.map(({ group, number }, visibleIndex) => {
        const isLastGroup = visibleIndex === visibleGroups.length - 1;

        return (
          <div key={group.startStep} className="flex flex-col">
            <GroupBlock
              group={group}
              number={number}
              steps={steps}
              currentStep={currentStep}
              hasError={hasError}
              activeStepDetail={activeStepDetail}
            />

            {!isLastGroup && <StepConnector />}
          </div>
        );
      })}
    </div>
  );
}
