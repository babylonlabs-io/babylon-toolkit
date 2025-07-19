import React from "react";
import { twJoin } from "tailwind-merge";

import { useMenuContext } from "./MenuContext";

interface MenuItemProps {
  /** Leading icon or element */
  icon?: React.ReactNode;
  /** Primary text content */
  name: string;
  /** Secondary text or description */
  description?: string;
  /** Click handler */
  onClick?: () => void;
  /** Disabled state */
  disabled?: boolean;
  /** Additional CSS classes */
  className?: string;
  /** Custom content (overrides default layout) */
  children?: React.ReactNode;
  /** Trailing element (e.g., chevron, badge, switch) */
  suffix?: React.ReactNode;
  /** Selected/active state */
  selected?: boolean;
  /** Role attribute for accessibility */
  role?: string;
}

export const MenuItem: React.FC<MenuItemProps> = ({
  icon,
  name,
  description,
  onClick,
  disabled = false,
  className,
  children,
  suffix,
  selected = false,
  role = "menuitem",
}) => {
  const menuContext = useMenuContext();

  const handleClick = () => {
    if (disabled || !onClick) return;
    onClick();
    // Close menu after click unless it has a suffix (indicating a submenu)
    if (menuContext && !suffix) {
      menuContext.onClose();
    }
  };

  // If children are provided, render them instead of the default layout
  if (children) {
    return (
      <button
        onClick={handleClick}
        disabled={disabled}
        className={twJoin("w-full text-left", disabled && "cursor-not-allowed opacity-50", className)}
      >
        {children}
      </button>
    );
  }

  return (
    <button
      onClick={handleClick}
      disabled={disabled}
      className={twJoin(
        "flex w-full items-center justify-between p-6",
        "transition-colors hover:bg-accent-secondary/5",
        "text-left",
        "focus:outline-none",
        selected && "bg-accent-secondary/10",
        disabled && "cursor-not-allowed opacity-50",
        className,
      )}
      role={role}
      aria-selected={selected}
      tabIndex={disabled ? -1 : 0}
    >
      <div className="flex items-center gap-3">
        {icon && <div className="flex-shrink-0">{icon}</div>}
        <div className="flex flex-col">
          <div className="text-sm font-medium text-accent-primary">{name}</div>
          {description && <div className="text-xs text-accent-secondary">{description}</div>}
        </div>
      </div>
      {suffix}
    </button>
  );
};
