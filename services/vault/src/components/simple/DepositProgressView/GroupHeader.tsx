import { Text } from "@babylonlabs-io/core-ui";
import { IoCheckmarkSharp } from "react-icons/io5";
import { twMerge } from "tailwind-merge";

import { COPY } from "@/copy";

import type { GroupStatus } from "./steps";

interface GroupHeaderProps {
  /** 1-based ordinal of the group, rendered as a letter (A, B, C, …). */
  number: number;
  title: string;
  status: GroupStatus;
  completedInGroup: number;
  totalInGroup: number;
}

/**
 * Group indicators use letters (A, B, C, …) so they read distinctly from the
 * numbered sub-steps nested inside each group.
 */
function groupLetter(ordinal: number): string {
  return String.fromCharCode("A".charCodeAt(0) + ordinal - 1);
}

function GroupIndicator({
  status,
  number,
}: {
  status: GroupStatus;
  number: number;
}) {
  const base = "flex h-8 w-8 shrink-0 items-center justify-center rounded-full";
  const ariaLabel = COPY.deposit.a11y.groupStatus[status];

  if (status === "completed") {
    return (
      <div className={twMerge(base, "bg-primary-light")} aria-label={ariaLabel}>
        <IoCheckmarkSharp size={16} className="text-accent-contrast" />
      </div>
    );
  }

  return (
    <div
      className={twMerge(
        base,
        "border-2",
        status === "active"
          ? "border-primary-light"
          : "border-secondary-strokeDark",
      )}
      aria-label={ariaLabel}
    >
      <Text
        as="span"
        variant="body2"
        className={twMerge(
          "font-medium",
          status === "active" ? "text-accent-primary" : "text-accent-secondary",
        )}
      >
        {groupLetter(number)}
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
}: GroupHeaderProps) {
  return (
    <div className="flex items-center gap-3">
      <GroupIndicator status={status} number={number} />
      <Text
        as="span"
        variant="body1"
        className={twMerge(
          "flex-1 font-medium",
          status === "upcoming"
            ? "text-accent-secondary"
            : "text-accent-primary",
        )}
      >
        {title}
      </Text>
      <Text as="span" variant="body2" className="text-accent-secondary">
        {COPY.deposit.groups.stepCounter(completedInGroup, totalInGroup)}
      </Text>
    </div>
  );
}
