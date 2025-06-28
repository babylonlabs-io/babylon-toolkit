import type { DetailedHTMLProps, HTMLAttributes } from "react";
import { twJoin } from "tailwind-merge";
import "./Chip.css";

export function Chip({ className, ...props }: DetailedHTMLProps<HTMLAttributes<HTMLSpanElement>, HTMLSpanElement>) {
  return <span {...props} className={twJoin("bbn-chip", className)} />;
}
