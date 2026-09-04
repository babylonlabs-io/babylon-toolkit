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
}: {
  state: StepRowState;
  number: number;
  /** Override for screen-reader label; defaults to `number` (visual) when absent. */
  ariaNumber?: number;
}) {
  // Sub-step indicators inside the active-group card: 16px, no enclosing circle
  // — a check / cross / spinner / ring instead of a numbered 32px circle.
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
        <span className="absolute inset-0 rounded-full border border-accent-secondary dark:border-secondary-strokeDark" />
        <Loader size={16} className="relative text-accent-primary" />
      </span>
    );
  }
  return (
    <span
      className="block h-4 w-4 shrink-0 rounded-full border border-accent-secondary dark:border-secondary-strokeDark"
      aria-label={COPY.deposit.a11y.stepPending(ariaNumber ?? number)}
    />
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
  /** Override for screen-reader label; defaults to `number` (visual) when absent. */
  ariaNumber?: number;
  /**
   * Stack the sub-counter below the label instead of inline beside it. Used in
   * the narrow split-deposit columns, where "label (x of n)" doesn't fit.
   */
  compact?: boolean;
}

export function StepRow({
  state,
  number,
  label,
  description,
  detail,
  ariaNumber,
  compact = false,
}: StepRowProps) {
  const isActive = state === "active";
  const hasDetail = isActive && Boolean(detail);
  // A detail panel makes the active row taller than the circle. When there's
  // no detail panel, align the circle and label vertically (items-center)
  // to match the non-active step alignment.
  return (
    <div
      className={twMerge(
        "flex gap-3",
        hasDetail ? "items-start" : "items-center",
      )}
    >
      <StepCircle state={state} number={number} ariaNumber={ariaNumber} />
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
              state === "error"
                ? "font-medium text-error-main"
                : isActive
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
