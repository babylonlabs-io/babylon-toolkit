import { Popover, ThreeDotsMenuIcon } from "@babylonlabs-io/core-ui";
import { ReactNode, useState } from "react";
import { twMerge } from "tailwind-merge";

interface ThreeDotsMenuProps {
  children: ReactNode;
  className?: string;
  buttonClassName?: string;
  popoverClassName?: string;
}

export const ThreeDotsMenu = ({
  children,
  className,
  buttonClassName,
  popoverClassName,
}: ThreeDotsMenuProps) => {
  const [open, setOpen] = useState(false);
  const [anchorEl, setAnchorEl] = useState<HTMLButtonElement | null>(null);

  return (
    <div className={className}>
      <button
        ref={setAnchorEl}
        onClick={() => setOpen(!open)}
        className={buttonClassName}
        aria-label="Open options"
      >
        <ThreeDotsMenuIcon
          size={20}
          className="text-accent-primary dark:text-white"
        />
      </button>

      <Popover
        open={open}
        anchorEl={anchorEl}
        placement="bottom-end"
        onClickOutside={() => setOpen(false)}
        offset={[0, 8]}
        className={
          popoverClassName ||
          "w-60 rounded border border-secondary-strokeLight bg-surface !p-0 shadow-md"
        }
      >
        <div className="flex flex-col" onClick={() => setOpen(false)}>
          {children}
        </div>
      </Popover>
    </div>
  );
};

interface ThreeDotsMenuItemProps {
  onClick: () => void;
  children: ReactNode;
  disabled?: boolean;
  className?: string;
}

export const ThreeDotsMenuItem = ({
  onClick,
  children,
  disabled = false,
  className,
}: ThreeDotsMenuItemProps) => (
  <button
    onClick={onClick}
    disabled={disabled}
    className={twMerge(
      "block w-full p-4 text-left text-sm text-accent-primary transition-all hover:bg-secondary-strokeLight/10 hover:brightness-125 disabled:cursor-not-allowed disabled:opacity-50",
      className,
    )}
  >
    <div className="text-left">{children}</div>
  </button>
);
