import { forwardRef, type DetailedHTMLProps, type InputHTMLAttributes, type ReactNode } from "react";
import { twJoin } from "tailwind-merge";
import "./Input.css";

export interface InputProps
  extends Omit<DetailedHTMLProps<InputHTMLAttributes<HTMLInputElement>, HTMLInputElement>, "prefix" | "suffix"> {
  className?: string;
  prefix?: ReactNode;
  suffix?: ReactNode;
  disabled?: boolean;
  state?: "default" | "error" | "warning";
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, prefix, suffix, disabled = false, state = "default", ...props }, ref) => {
    return (
      <div className={twJoin("bbn-input", `bbn-input-${state}`, disabled && "bbn-input-disabled", suffix && "bbn-input-has-suffix")}>
        {prefix && <div className="bbn-input-prefix">{prefix}</div>}
        <input ref={ref} className={twJoin("bbn-input-field", className)} disabled={disabled} {...props} />
        {suffix && <div className="bbn-input-suffix">{suffix}</div>}
      </div>
    );
  },
);

Input.displayName = "Input";
