import type { CSSProperties, ReactNode } from "react";
import { twJoin } from "tailwind-merge";

export const SubSection = ({
  children,
  style,
  className,
}: {
  children: ReactNode;
  style?: CSSProperties;
  className?: string;
}) => (
  <div className={twJoin("flex rounded bg-secondary-highlight p-4 text-accent-primary", className)} style={style}>
    {children}
  </div>
);
