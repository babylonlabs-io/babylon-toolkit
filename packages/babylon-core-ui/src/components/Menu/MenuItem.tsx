import React from "react";
import { twJoin } from "tailwind-merge";

import { useMenuContext } from "./MenuContext";
import { Toggle } from "../Toggle/Toggle";

interface MenuItemToggleProps {
  /** Current toggle value */
  value?: boolean;
  /** Default toggle value */
  defaultValue?: boolean;
  /** Toggle change handler */
  onChange?: (value: boolean) => void;
  /** Icon to show when toggle is active */
  activeIcon?: React.ReactNode;
  /** Icon to show when toggle is inactive */
  inactiveIcon?: React.ReactNode;
}

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
  /** Toggle configuration - when provided, renders a toggle switch as suffix */
  toggle?: MenuItemToggleProps;
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
  toggle,
}) => {
  const menuContext = useMenuContext();

  const toggleElement = toggle ? (
    <Toggle
      value={toggle.value}
      defaultValue={toggle.defaultValue}
      onChange={toggle.onChange}
    />
  ) : null;

  const finalSuffix = toggleElement || suffix;

  const handleClick = () => {
    if (disabled) return;
    
    if (toggleElement) return;
    
    if (onClick) {
      onClick();
    }
    
    if (menuContext && !finalSuffix) {
      menuContext.onClose();
    }
  };

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
    <div
      className={twJoin(
        "flex w-full items-center justify-between p-6",
        "transition-colors",
        !toggleElement && "cursor-pointer hover:bg-accent-secondary/5", // Only hover if no toggle
        "text-left",
        selected && "bg-accent-secondary/10",
        disabled && "cursor-not-allowed opacity-50",
        toggleElement && "cursor-default", // Disable pointer cursor when toggle is present
        className,
      )}
      role={role}
      aria-selected={selected}
      onClick={handleClick}
    >
      <div className="flex items-center gap-3">
        {icon && <div className="flex-shrink-0">{icon}</div>}
        <div className="flex flex-col">
          <div className="text-sm font-medium text-accent-primary">{name}</div>
          {description && <div className="text-xs text-accent-secondary">{description}</div>}
        </div>
      </div>
      {finalSuffix && (
        <div className="flex-shrink-0">
          {finalSuffix}
        </div>
      )}
    </div>
  );
};
