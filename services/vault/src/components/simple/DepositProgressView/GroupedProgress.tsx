/**
 * GroupedProgress
 *
 * Renders the deposit flow steps grouped into logical sections (see STEP_GROUPS).
 * Only the group holding the current step renders: finished groups fold into the
 * "X of N steps completed" pill and later groups stay out of sight until their
 * turn. That group expands into a filled card revealing its sub-steps — except
 * at the pre-sign entry (`started` false), where it stays a collapsed header row
 * unless it owns the Pre-PegIn step and carries the fee selector (see
 * GroupBlock). Nothing renders once the flow completes: no group holds the step
 * past the last one.
 */

import type { StepperItem } from "@babylonlabs-io/core-ui";
import type { ReactNode } from "react";

import { GroupBlock } from "./GroupBlock";
import { buildStepGroups, groupContainsStep } from "./steps";

interface GroupedProgressProps {
  steps: StepperItem[];
  /** 1-based visual step (TOTAL_VISUAL_STEPS + 1 when complete). */
  currentStep: number;
  /** Optional detail panel rendered inside the active step row. */
  activeStepDetail?: ReactNode;
  /** When true, the current step failed — render it as an error, not active. */
  hasError?: boolean;
  /** False in the pre-entry state — no group expands (see buildStepGroups). */
  started?: boolean;
  /** Pre-sign entry panel, rendered under the Pre-PegIn step (see GroupBlock). */
  preSignDetail?: ReactNode;
}

export function GroupedProgress({
  steps,
  currentStep,
  activeStepDetail,
  hasError = false,
  started = true,
  preSignDetail,
}: GroupedProgressProps) {
  const groups = buildStepGroups(currentStep, started);
  // Original 1-based group numbers are preserved (after group 1 finishes, the
  // rendered group still reads "2") to match the design.
  const index = groups.findIndex((group) =>
    groupContainsStep(group, currentStep),
  );
  const group = groups[index];

  if (!group) return null;

  return (
    <GroupBlock
      group={group}
      number={index + 1}
      steps={steps}
      currentStep={currentStep}
      hasError={hasError}
      activeStepDetail={activeStepDetail}
      preSignDetail={preSignDetail}
    />
  );
}
