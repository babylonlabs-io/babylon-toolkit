import { Loader, Text } from "@babylonlabs-io/core-ui";
import { IoCheckmarkSharp } from "react-icons/io5";
import { twMerge } from "tailwind-merge";

import { COPY } from "@/copy";

import type { GroupStatus } from "./steps";

interface GroupHeaderProps {
  title: string;
  status: GroupStatus;
  completedInGroup: number;
  totalInGroup: number;
}

function GroupIndicator({ status }: { status: GroupStatus }) {
  const base = "flex h-8 w-8 shrink-0 items-center justify-center rounded-full";

  if (status === "completed") {
    return (
      <div className={twMerge(base, "bg-primary-light")}>
        <IoCheckmarkSharp size={16} className="text-accent-contrast" />
      </div>
    );
  }

  if (status === "active") {
    return (
      <div className={twMerge(base, "border-2 border-primary-light")}>
        <Loader size={16} className="text-primary-light" />
      </div>
    );
  }

  return (
    <div className={twMerge(base, "border-2 border-secondary-strokeDark")} />
  );
}

export function GroupHeader({
  title,
  status,
  completedInGroup,
  totalInGroup,
}: GroupHeaderProps) {
  return (
    <div className="flex items-center gap-3">
      <GroupIndicator status={status} />
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
