import { MdKeyboardArrowDown } from "react-icons/md";
import { twMerge } from "tailwind-merge";

import { ThemedIcon } from "../../Icons/ThemedIcon";

interface ExpansionButtonProps {
  Icon: string;
  text: string;
  counter?: string;
  onClick: () => void;
  className?: string;
  disabled?: boolean;
}

export function ExpansionButton({
  Icon,
  text,
  counter,
  onClick,
  className = "",
  disabled = false,
}: ExpansionButtonProps) {
  return (
    <button
      className={twMerge(
        "btn btn-ghost border-0",
        disabled && "cursor-not-allowed opacity-50",
        className,
      )}
      onClick={onClick}
      disabled={disabled}
    >
      <div className="flex w-full items-center justify-between gap-4">
        <ThemedIcon
          variant="primary"
          background
          rounded
          className={twMerge(
            "flex h-10 w-10 flex-shrink-0 items-center justify-center p-2",
            className,
          )}
        >
          <img src={Icon} alt={text} className="h-8 w-8" />
        </ThemedIcon>
        <div className="flex w-full flex-col items-start">
          <span className="text-sm text-accent-primary">{text}</span>
          {counter && <span className="text-xs">{counter}</span>}
        </div>
        <MdKeyboardArrowDown
          size={24}
          className="-rotate-90 transform text-current"
        />
      </div>
    </button>
  );
}
