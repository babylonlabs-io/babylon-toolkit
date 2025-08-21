import type { CSSProperties, ReactNode } from "react";
import { twJoin } from "tailwind-merge";
import "./SubSection.css";

export const SubSection = ({
  children,
  style,
  variant = "contained",
  className,
}: {
  children: ReactNode;
  style?: CSSProperties;
  variant?: "outlined" | "contained";
  className?: string;
}) => (
  <div
    className={twJoin("bbn-subsection", `bbn-subsection-${variant}`, className)}
    style={style}
  >
    {children}
  </div>
);
