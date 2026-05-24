import { Loader, Text } from "@babylonlabs-io/core-ui";
import type { ReactNode } from "react";
import { IoCheckmarkSharp } from "react-icons/io5";
import { twMerge } from "tailwind-merge";

import { COPY } from "@/copy";

export type StepRowState = "completed" | "active" | "pending";

function StepCircle({
  state,
  number,
}: {
  state: StepRowState;
  number: number;
}) {
  const base = "flex h-8 w-8 shrink-0 items-center justify-center rounded-full";

  if (state === "completed") {
    return (
      <div className={twMerge(base, "bg-primary-light")}>
        <IoCheckmarkSharp size={16} className="text-accent-contrast" />
      </div>
    );
  }

  if (state === "active") {
    return (
      <div
        className={twMerge(base, "border-2 border-primary-light")}
        aria-label={COPY.deposit.a11y.stepActive(number)}
      >
        <Loader size={16} className="text-primary-light" />
      </div>
    );
  }

  return (
    <div className={twMerge(base, "border-2 border-secondary-strokeDark")}>
      <Text
        as="span"
        variant="body2"
        className="font-medium text-accent-secondary"
      >
        {number}
      </Text>
    </div>
  );
}

interface StepRowProps {
  state: StepRowState;
  number: number;
  label: string;
  /** Sub-counter (e.g. "(1 of 2)"); rendered only on the active step. */
  description?: string;
  /** Detail panel rendered below the label; rendered only on the active step. */
  detail?: ReactNode;
  /** True when another sub-step follows in the group (i.e. not the last). */
  hasNext?: boolean;
}

export function StepRow({
  state,
  number,
  label,
  description,
  detail,
  hasNext = false,
}: StepRowProps) {
  const isActive = state === "active";
  const hasDetail = isActive && Boolean(detail);
  // A detail panel makes the active row taller than the circle. When there's
  // no detail panel, align the circle and label vertically (items-center)
  // to match the non-active step alignment. Fill the extra height from a
  // detail panel with a connector segment so the timeline stays unbroken
  // — but never dangle a line below the group's last step.
  const showTrailingLine = hasDetail && hasNext;

  return (
    <div
      className={twMerge(
        "flex gap-3",
        hasDetail ? "items-start" : "items-center",
      )}
    >
      <div className="flex w-8 flex-col items-center self-stretch">
        <StepCircle state={state} number={number} />
        {showTrailingLine && (
          <div className="w-0 flex-1 border-l-2 border-secondary-strokeDark" />
        )}
      </div>
      <div className="flex flex-1 flex-col">
        <div className="flex items-baseline gap-2">
          <Text
            as="span"
            variant="body2"
            className={
              isActive
                ? "font-medium text-accent-primary"
                : "text-accent-secondary"
            }
          >
            {label}
          </Text>
          {isActive && description && (
            <Text as="span" variant="body2" className="text-accent-secondary">
              {description}
            </Text>
          )}
        </div>
        {isActive && detail}
      </div>
    </div>
  );
}
