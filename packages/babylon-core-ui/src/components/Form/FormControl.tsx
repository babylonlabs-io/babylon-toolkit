import { type PropsWithChildren } from "react";
import { twJoin } from "tailwind-merge";
import "./FormControl.css";

export interface FormControlProps extends PropsWithChildren {
  label?: string | JSX.Element;
  hint?: string | JSX.Element;
  state?: "default" | "error" | "warning" | "success";
  className?: string;
}

export function FormControl({ children, label, hint, state = "default", className }: FormControlProps) {
  return (
    <div className={twJoin("bbn-form-control", className)}>
      {label ? (
        <label className="bbn-form-control-label">
          <div className="bbn-form-control-title">{label}</div>
          {children}
        </label>
      ) : (
        children
      )}

      {hint && <div className={twJoin("bbn-form-control-hint", `bbn-form-control-hint-${state}`)}>{hint}</div>}
    </div>
  );
}
