import type { PropsWithChildren } from "react";
import { twMerge } from "tailwind-merge";

interface FieldControl {
  label: string | JSX.Element;
  className?: string;
}

export function FieldControl({ label, className, children }: PropsWithChildren<FieldControl>) {
  return (
    <label
      className={twMerge(
        "flex cursor-pointer gap-4 rounded border border-secondary-strokeLight text-accent-primary p-4",
        className,
      )}
    >
      {children}
      {label}
    </label>
  );
}
