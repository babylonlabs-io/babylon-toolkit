import { Avatar, Text } from "@babylonlabs-io/core-ui";
import type { ReactNode } from "react";

export function renderNameCell(name: string) {
  return (
    <div className="flex min-w-0 items-center gap-2">
      <Avatar variant="circular" size="small" url="">
        <Text
          as="span"
          className="inline-flex h-full w-full items-center justify-center rounded-full bg-secondary-main text-[1rem] uppercase text-accent-contrast"
        >
          {name.charAt(0)}
        </Text>
      </Avatar>
      <span className="truncate">{name}</span>
    </div>
  );
}
export function renderRightAlignedCell(
  value: ReactNode,
  maxWidthClass: string,
) {
  return (
    <span className={`inline-block ${maxWidthClass} truncate text-right`}>
      {value}
    </span>
  );
}
