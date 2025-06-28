import type { PropsWithChildren, ReactNode } from "react";
import { twJoin } from "tailwind-merge";
import "./Badge.css";

export interface BadgeProps extends PropsWithChildren {
  /**
   * The number or content to display in the badge
   */
  count?: number | ReactNode;
  /**
   * Max count to show. If count is greater than max, show max+
   */
  max?: number;
  /**
   * The position of the badge
   */
  position?: "top-right" | "top-left" | "bottom-right" | "bottom-left";
  /**
   * The color of the badge
   */
  color?: "primary" | "secondary" | "error" | "warning" | "info" | "success";
  /**
   * Additional CSS class for the badge wrapper
   */
  className?: string;
  /**
   * Additional CSS class for the badge indicator
   */
  badgeClassName?: string;
  /**
   * Additional CSS class for the badge content
   */
  contentClassName?: string;
}

export function Badge({
  children,
  count = 0,
  max = 99,
  position = "bottom-right",
  color = "error",
  className,
  badgeClassName,
  contentClassName,
}: BadgeProps) {
  const shouldShow = typeof count === "number" ? count > 0 : count != null;
  const displayValue = typeof count === "number" && count > max ? `${max}+` : count;

  const positionClass = `bbn-badge-${position}`;
  const colorClass = `bbn-badge-${color}`;

  return (
    <div className={twJoin("bbn-badge", className)}>
      {children}
      {shouldShow && (
        <span className={twJoin("bbn-badge-indicator", positionClass, colorClass, badgeClassName)}>
          <span className={twJoin("bbn-badge-content", contentClassName)}>{displayValue}</span>
        </span>
      )}
    </div>
  );
}
