import { Loader, Text } from "@babylonlabs-io/core-ui";
import type { ReactNode } from "react";
import { IoCheckmarkSharp, IoCloseSharp } from "react-icons/io5";
import { twMerge } from "tailwind-merge";

import { COPY } from "@/copy";

export type StepRowState = "completed" | "active" | "pending" | "error";

function StepCircle({
  state,
  number,
  ariaNumber,
  inCard = false,
}: {
  state: StepRowState;
  number: number;
  /** Override for screen-reader label; defaults to `number` (visual) when absent. */
  ariaNumber?: number;
  /**
   * Small, bare indicators (no 32px chrome) for sub-steps rendered inside the
   * active-group card — a 16px check / spinner / ring instead of the numbered
   * 32px circle used at the group level.
   */
  inCard?: boolean;
}) {
  // Sub-step indicators inside the active-group card: 16px, no enclosing circle.
  if (inCard) {
    if (state === "completed") {
      return (
        <IoCheckmarkSharp size={16} className="shrink-0 text-success-bright" />
      );
    }
    if (state === "error") {
      return (
        <IoCloseSharp
          size={16}
          className="shrink-0 text-error-main"
          aria-label={COPY.deposit.a11y.stepFailed(ariaNumber ?? number)}
        />
      );
    }
    if (state === "active") {
      return (
        <span
          className="relative flex h-4 w-4 shrink-0 items-center justify-center"
          aria-label={COPY.deposit.a11y.stepActive(ariaNumber ?? number)}
        >
          {/* Static track ring in stroke/primary; the white arc spins over it. */}
          <span className="absolute inset-0 rounded-full border border-secondary-strokeDark" />
          <Loader size={16} className="relative text-accent-primary" />
        </span>
      );
    }
    return (
      <span
        className="block h-4 w-4 shrink-0 rounded-full border border-secondary-strokeDark"
        aria-label={COPY.deposit.a11y.stepPending(ariaNumber ?? number)}
      />
    );
  }

  const base = "flex h-8 w-8 shrink-0 items-center justify-center rounded-full";

  if (state === "completed") {
    return (
      <div className={twMerge(base, "bg-primary-light")}>
        <IoCheckmarkSharp size={16} className="text-accent-contrast" />
      </div>
    );
  }

  if (state === "error") {
    return (
      <div
        className={twMerge(base, "bg-error-main")}
        aria-label={COPY.deposit.a11y.stepFailed(ariaNumber ?? number)}
      >
        <IoCloseSharp size={16} className="text-accent-contrast" />
      </div>
    );
  }

  if (state === "active") {
    return (
      <div
        className={twMerge(base, "border-2 border-primary-light")}
        aria-label={COPY.deposit.a11y.stepActive(ariaNumber ?? number)}
      >
        <Loader size={16} className="text-primary-light" />
      </div>
    );
  }

  return (
    <div
      className={twMerge(base, "border-2 border-secondary-strokeDark")}
      aria-label={COPY.deposit.a11y.stepPending(ariaNumber ?? number)}
    >
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
  /** Override for screen-reader label; defaults to `number` (visual) when absent. */
  ariaNumber?: number;
  /**
   * Stack the sub-counter below the label instead of inline beside it. Used in
   * the narrow split-deposit columns, where "label (x of n)" doesn't fit.
   */
  compact?: boolean;
  /**
   * When true, render without the left timeline column — just circle + label +
   * detail, left-aligned. Used inside the active-group card in
   * {@link GroupedProgress}.
   */
  inCard?: boolean;
}

export function StepRow({
  state,
  number,
  label,
  description,
  detail,
  hasNext = false,
  ariaNumber,
  compact = false,
  inCard = false,
}: StepRowProps) {
  const isActive = state === "active";
  const hasDetail = isActive && Boolean(detail);
  // A detail panel makes the active row taller than the circle. When there's
  // no detail panel, align the circle and label vertically (items-center)
  // to match the non-active step alignment. Fill the extra height from a
  // detail panel with a connector segment so the timeline stays unbroken
  // — but never dangle a line below the group's last step.
  const showTrailingLine = !inCard && hasDetail && hasNext;

  return (
    <div
      className={twMerge(
        "flex gap-3",
        hasDetail ? "items-start" : "items-center",
      )}
    >
      {inCard ? (
        <StepCircle
          state={state}
          number={number}
          ariaNumber={ariaNumber}
          inCard
        />
      ) : (
        <div className="flex w-8 flex-col items-center self-stretch">
          <StepCircle state={state} number={number} ariaNumber={ariaNumber} />
          {showTrailingLine && (
            <div className="w-0 flex-1 border-l-2 border-secondary-strokeDark" />
          )}
        </div>
      )}
      <div className="flex flex-1 flex-col">
        <div
          className={
            // Compact (narrow split column): counter drops below the label.
            // Otherwise: label and counter sit inline.
            compact
              ? "flex flex-col items-start gap-0.5"
              : "flex items-baseline gap-2"
          }
        >
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
