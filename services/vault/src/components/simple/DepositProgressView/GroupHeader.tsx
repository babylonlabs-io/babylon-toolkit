import { Text } from "@babylonlabs-io/core-ui";
import { IoCheckmarkSharp, IoCloseSharp } from "react-icons/io5";
import { twMerge } from "tailwind-merge";

import { COPY } from "@/copy";

import type { GroupStatus } from "./steps";

interface GroupHeaderProps {
  /** 1-based ordinal of the group, rendered as a number. */
  number: number;
  title: string;
  status: GroupStatus;
  completedInGroup: number;
  totalInGroup: number;
  /** True when this group's current step failed — render title + circle red. */
  hasError?: boolean;
}

function GroupIndicator({
  status,
  number,
  hasError,
}: {
  status: GroupStatus;
  number: number;
  hasError: boolean;
}) {
  const base = "flex h-8 w-8 shrink-0 items-center justify-center rounded-full";
  const ariaLabel = hasError
    ? COPY.deposit.a11y.groupStatus.failed
    : COPY.deposit.a11y.groupStatus[status];

  if (status === "completed") {
    return (
      <div
        className={twMerge(base, "bg-success-bright")}
        aria-label={ariaLabel}
      >
        <IoCheckmarkSharp size={16} className="text-accent-contrast" />
      </div>
    );
  }

  if (hasError) {
    return (
      <div
        className={twMerge(base, "border-2 border-error-main")}
        aria-label={ariaLabel}
      >
        <IoCloseSharp size={16} className="text-error-main" />
      </div>
    );
  }

  return (
    <div
      className={twMerge(
        base,
        "border-2 border-accent-secondary dark:border-secondary-strokeDark",
      )}
      aria-label={ariaLabel}
    >
      <Text
        as="span"
        variant="body2"
        className="font-medium text-accent-primary"
      >
        {number}
      </Text>
    </div>
  );
}

export function GroupHeader({
  number,
  title,
  status,
  completedInGroup,
  totalInGroup,
  hasError = false,
}: GroupHeaderProps) {
  return (
    <div className="flex items-center gap-3">
      <GroupIndicator status={status} number={number} hasError={hasError} />
      <Text
        as="span"
        variant="body1"
        className={twMerge(
          "flex-1 font-medium",
          hasError ? "text-error-main" : "text-accent-primary",
        )}
      >
        {title}
      </Text>
      <Text
        as="span"
        variant="body2"
        className={
          status === "active" ? "text-accent-primary" : "text-accent-secondary"
        }
      >
        {COPY.deposit.groups.stepCounter(completedInGroup, totalInGroup)}
      </Text>
    </div>
  );
}
