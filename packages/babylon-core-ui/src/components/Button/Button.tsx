import { type DetailedHTMLProps, type HTMLAttributes, forwardRef } from "react";
import { twJoin } from "tailwind-merge";
import "./Button.css";

export interface ButtonProps
  extends Omit<DetailedHTMLProps<HTMLAttributes<HTMLButtonElement>, HTMLButtonElement>, "size"> {
  className?: string;
  disabled?: boolean;
  fluid?: boolean;
  variant?: "outlined" | "contained" | "ghost";
  color?: "primary" | "secondary";
  size?: "small" | "medium" | "large";
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    { variant = "contained", size = "large", color = "primary", fluid = false, className, disabled, ...restProps },
    ref,
  ) => {
    return (
      <button
        {...restProps}
        disabled={disabled}
        ref={ref}
        className={twJoin(
          "bbn-btn",
          `bbn-btn-${variant}`,
          `bbn-btn-${color}`,
          `bbn-btn-${size}`,
          fluid && "bbn-btn-fluid",
          className,
        )}
      />
    );
  },
);

Button.displayName = "Button";
