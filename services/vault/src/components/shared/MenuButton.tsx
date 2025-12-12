/**
 * MenuButton Component
 * A horizontal three-dot menu button for action menus
 */

import { forwardRef } from "react";

interface MenuButtonProps {
  onClick: () => void;
  "aria-label"?: string;
}

export const MenuButton = forwardRef<HTMLButtonElement, MenuButtonProps>(
  ({ onClick, "aria-label": ariaLabel = "More actions" }, ref) => {
    return (
      <button
        ref={ref}
        onClick={onClick}
        className="rounded p-1 transition-colors hover:bg-secondary-highlight dark:hover:bg-primary-main"
        aria-label={ariaLabel}
      >
        <svg
          width="20"
          height="20"
          viewBox="0 0 20 20"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="text-accent-primary"
        >
          <circle cx="4" cy="10" r="1.5" fill="currentColor" />
          <circle cx="10" cy="10" r="1.5" fill="currentColor" />
          <circle cx="16" cy="10" r="1.5" fill="currentColor" />
        </svg>
      </button>
    );
  },
);

MenuButton.displayName = "MenuButton";
