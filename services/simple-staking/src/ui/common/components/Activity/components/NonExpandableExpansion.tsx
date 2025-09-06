import { Card, Popover, Text, WarningIcon } from "@babylonlabs-io/core-ui";
import { useRef, useState } from "react";
import { twMerge } from "tailwind-merge";

import { STAKE_EXPANSION_MESSAGE } from "@/ui/common/constants";

interface NonExpandableExpansionProps {
  className?: string;
}

export function NonExpandableExpansion({
  className = "",
}: NonExpandableExpansionProps) {
  const [open, setOpen] = useState(false);
  const anchorRef = useRef<HTMLDivElement | null>(null);

  return (
    <div>
      <Card
        className={twMerge(
          "flex w-full items-center justify-between gap-4 p-4",
          className,
        )}
      >
        <div className="flex items-center gap-4">
          <div className="flex w-full flex-col items-start">
            <Text variant="body1" className="font-medium text-accent-primary">
              Stake Expansion
            </Text>
          </div>
        </div>
        <div
          ref={anchorRef}
          onMouseEnter={() => setOpen(true)}
          onMouseLeave={() => setOpen(false)}
          className="cursor-pointer"
        >
          <WarningIcon variant="accent-primary" size={22} />
        </div>
      </Card>
      <Popover
        open={open}
        anchorEl={anchorRef.current}
        placement="top-end"
        onClickOutside={() => setOpen(false)}
        className="w-[18rem] rounded border border-secondary-strokeLight bg-surface p-4 shadow-md"
      >
        <Text variant="body2" className="text-accent-primary">
          {STAKE_EXPANSION_MESSAGE}
        </Text>
      </Popover>
    </div>
  );
}
