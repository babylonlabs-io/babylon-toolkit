import React from "react";
import { twJoin } from "tailwind-merge";

interface SubMenuItemProps {
  /** Primary text content */
  label: string;
  /** Secondary text or description */
  description?: string;
  /** Click handler */
  onClick?: () => void;
  /** Selected/active state */
  selected?: boolean;
  /** Additional CSS classes */
  className?: string;
  /** Custom suffix element (defaults to checkmark when selected) */
  suffix?: React.ReactNode;
  /** Disabled state */
  disabled?: boolean;
}

export const SubMenuItem: React.FC<SubMenuItemProps> = ({
  label,
  description,
  onClick,
  selected = false,
  className,
  suffix,
  disabled = false,
}) => {
  const defaultCheckmark = (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M16.6667 5L7.5 14.1667L3.33333 10"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );

  return (
    <button
      role="menuitem"
      onClick={onClick}
      disabled={disabled}
      className={twJoin(
        "flex w-full items-center justify-between p-4",
        "transition-colors hover:bg-accent-secondary/5",
        "text-left focus:outline-none",
        selected && "bg-accent-secondary/10",
        disabled && "cursor-not-allowed opacity-50",
        className,
      )}
      aria-selected={selected}
      tabIndex={disabled ? -1 : 0}
    >
      <div className="flex flex-col items-start">
        <span className="font-medium text-accent-primary">{label}</span>
        {description && <span className="text-sm text-accent-secondary">{description}</span>}
      </div>
      {selected && (suffix || defaultCheckmark)}
    </button>
  );
};
