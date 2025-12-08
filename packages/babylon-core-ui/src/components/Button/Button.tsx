import { type DetailedHTMLProps, type ButtonHTMLAttributes, forwardRef } from "react";
import { twJoin } from "tailwind-merge";
import "./Button.css";

export interface ButtonProps
  extends Omit<DetailedHTMLProps<ButtonHTMLAttributes<HTMLButtonElement>, HTMLButtonElement>, "size"> {
  className?: string;
  disabled?: boolean;
  fluid?: boolean;
  variant?: "outlined" | "contained" | "ghost";
  color?: "primary" | "secondary";
  size?: "small" | "medium" | "large";
  rounded?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant = "contained",
      size = "large",
      color = "primary",
      fluid = false,
      rounded = false,
      className,
      disabled,
      ...restProps
    },
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
          rounded && "bbn-btn-rounded",
          className,
        )}
      />
    );
  },
);

Button.displayName = "Button";
