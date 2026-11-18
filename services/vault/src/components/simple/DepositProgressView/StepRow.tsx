import { InfoIcon, Loader, Text } from "@babylonlabs-io/core-ui";
import type { ReactNode } from "react";
import { IoCheckmarkSharp, IoCloseSharp } from "react-icons/io5";
import { twMerge } from "tailwind-merge";

import { COPY } from "@/copy";

export type StepRowState =
  | "completed"
  | "active"
  | "pending"
  | "error"
  // Stopped with an outcome the app cannot tell: neither running nor failed.
  | "unknown";

function StepCircle({
  state,
  number,
}: {
  state: StepRowState;
  number: number;
}) {
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
        aria-label={COPY.deposit.a11y.stepFailed(number)}
      />
    );
  }
  return (
    <span
      className={twMerge(
        "relative flex h-4 w-4 shrink-0 items-center justify-center rounded-full border",
        state === "unknown"
          ? "border-warning-main"
          : "border-accent-secondary dark:border-secondary-strokeDark",
      )}
      aria-label={
        state === "unknown"
          ? COPY.deposit.a11y.stepUnknown(number)
          : state === "active"
            ? COPY.deposit.a11y.stepActive(number)
            : COPY.deposit.a11y.stepPending(number)
      }
    >
      {state === "active" && (
        <Loader size={16} className="absolute text-accent-primary" />
      )}
    </span>
  );
}

interface StepRowProps {
  state: StepRowState;
  number: number;
  label: string;
  /** Sub-counter (e.g. "(1 of 2)"); rendered only on the active step. */
  description?: string;
  help?: string;
  /** Detail panel rendered below the label; rendered only on the active step. */
  detail?: ReactNode;
  /** Override for screen-reader label; defaults to `number` (visual) when absent. */
  ariaNumber?: number;
}

export function StepRow({
  state,
  number,
  label,
  description,
  help,
  detail,
  ariaNumber,
}: StepRowProps) {
  const isActive = state === "active";
  return (
    <div className="flex items-start gap-3">
      <StepCircle state={state} number={ariaNumber ?? number} />
      <div className="flex min-w-0 flex-1 flex-col">
        <details>
          <summary className="flex cursor-pointer list-none flex-wrap items-baseline gap-2 [&::-webkit-details-marker]:hidden">
            <Text
              as="span"
              variant="body2"
              className={
                state === "error"
                  ? "font-medium text-error-main"
                  : isActive || state === "unknown"
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
            <InfoIcon size={16} className="text-accent-secondary" />
          </summary>
          {help && (
            <Text as="p" variant="body2" className="mt-2 text-accent-secondary">
              {help}
            </Text>
          )}
        </details>
        {isActive && detail}
      </div>
    </div>
  );
}
