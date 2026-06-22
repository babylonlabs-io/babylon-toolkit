/**
 * ActiveGroupCard
 *
 * The expanded card for the group that contains the current step. Shows the
 * group header (number, title, "x/n" counter) above a divider, then the single
 * active sub-step — its position within the group is conveyed by the counter,
 * so completed/pending sub-steps are not listed individually.
 */

import type { StepperItem } from "@babylonlabs-io/core-ui";
import type { ReactNode } from "react";

import { GroupHeader } from "./GroupHeader";
import { StepRow } from "./StepRow";

interface ActiveGroupCardProps {
  /** 1-based ordinal of the group, shown in the header circle. */
  number: number;
  title: string;
  /** 1-based position of the active sub-step within the group. */
  currentInGroup: number;
  totalInGroup: number;
  /** The active sub-step to render below the divider. */
  step: StepperItem;
  /** Global visual step number, for the sub-step's screen-reader label. */
  ariaNumber: number;
  /** Detail panel rendered under the sub-step (wait status, fee notice). */
  detail?: ReactNode;
  /** Render the sub-step in its failed state. */
  errored?: boolean;
  /** Narrow split-deposit column: stack the sub-step's counter below its label. */
  compact?: boolean;
}

export function ActiveGroupCard({
  number,
  title,
  currentInGroup,
  totalInGroup,
  step,
  ariaNumber,
  detail,
  errored = false,
  compact = false,
}: ActiveGroupCardProps) {
  return (
    <div className="flex flex-col gap-3 rounded-2xl bg-background-secondary p-4">
      <GroupHeader
        number={number}
        title={title}
        status="active"
        currentInGroup={currentInGroup}
        totalInGroup={totalInGroup}
      />
      <div className="h-px w-full bg-stroke-secondary" />
      <div className="px-2">
        <StepRow
          label={step.label}
          description={step.description}
          detail={detail}
          errored={errored}
          compact={compact}
          ariaNumber={ariaNumber}
        />
      </div>
    </div>
  );
}
