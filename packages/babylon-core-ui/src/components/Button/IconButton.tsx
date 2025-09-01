import { type DetailedHTMLProps, type HTMLAttributes, forwardRef } from "react";
import { twJoin } from "tailwind-merge";
import "./IconButton.css";

type ButtonProps = Omit<DetailedHTMLProps<HTMLAttributes<HTMLButtonElement>, HTMLButtonElement>, "size">;

export interface IconButtonProps extends ButtonProps {
  className?: string;
  variant?: "outlined" | "contained";
  size?: "small" | "medium" | "large";
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(
  ({ variant = "outlined", size = "large", className, ...restProps }, ref) => {
    return (
      <button
        {...restProps}
        ref={ref}
        className={twJoin(
          "bbn-btn-icon",
          `bbn-btn-icon-${variant}`,
          `bbn-btn-icon-${size}`,
          className,
        )}
      />
    );
  },
);
