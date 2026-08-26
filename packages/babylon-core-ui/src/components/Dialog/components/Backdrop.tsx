import type { DetailedHTMLProps, HTMLAttributes } from "react";
import { twJoin } from "tailwind-merge";
import "./Backdrop.css";

export interface BackdropProps extends DetailedHTMLProps<HTMLAttributes<HTMLDivElement>, HTMLDivElement> {
  open?: boolean;
}

export const Backdrop = ({ open = false, ...props }: BackdropProps) => (
  <div
    {...props}
    className={twJoin("bbn-backdrop", open ? "animate-backdrop-in" : "animate-backdrop-out", props.className)}
  />
);
