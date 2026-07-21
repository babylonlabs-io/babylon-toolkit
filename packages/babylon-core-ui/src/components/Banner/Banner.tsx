import { type HTMLAttributes, type ReactNode } from "react";
import { twJoin } from "tailwind-merge";

import "./Banner.css";

export type BannerVariant = "critical" | "notice";

export interface BannerProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  icon?: ReactNode;
  variant?: BannerVariant;
}

export function Banner({ children, className, icon, role, variant = "critical", ...props }: BannerProps) {
  return (
    <div
      className={twJoin("bbn-banner", `bbn-banner-${variant}`, className)}
      role={role ?? (variant === "critical" ? "alert" : "status")}
      {...props}
    >
      <div className="bbn-banner-content">
        {icon && <div className="bbn-banner-icon">{icon}</div>}
        {children}
      </div>
    </div>
  );
}
