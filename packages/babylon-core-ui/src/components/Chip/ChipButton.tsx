import type { ButtonHTMLAttributes } from "react";
import { twJoin } from "tailwind-merge";
import "./Chip.css";

export interface ChipButtonProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> {
  children: React.ReactNode;
  className?: string;
}

export function ChipButton({
  children,
  className,
  disabled,
  ...props
}: ChipButtonProps) {
  return (
    <button
      type="button"
      disabled={disabled}
      className={twJoin(
        "bbn-chip m-0 shrink-0 rounded-full border-0 bg-transparent",
        "!bg-primary-light !text-accent-contrast",
        "cursor-pointer disabled:cursor-default",
        disabled && "opacity-50",
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}
