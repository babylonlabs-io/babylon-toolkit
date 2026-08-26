import React, { useState } from "react";
import { twJoin } from "tailwind-merge";
import { MenuDrawer } from "./MenuDrawer";
import { useMenuContext } from "./MenuContext";

interface SubMenuProps {
  /** Nested submenu content */
  children: React.ReactNode;
  /** Primary text to display in the menu item */
  name?: string; // This is the recommended property for the primary text in menu items. Use this instead of older alternatives.
  /** Secondary text for the menu item */
  description?: string; // This is the recommended property for secondary text in menu items. Use this instead of older alternatives.
  /** Leading icon */
  icon?: React.ReactNode;
  /** Icon used for the back button inside the drawer */
  backIcon?: React.ReactNode;
  /** Trailing element shown in the menu item (defaults to chevron) */
  suffix?: React.ReactNode;
  /** Extra classes for the menu item button */
  className?: string;
  /** Extra classes for the drawer */
  contentClassName?: string;
  /** Title alignment in the drawer header */
  titleAlign?: "left" | "center" | "right";
}

export const SubMenu: React.FC<SubMenuProps> = ({
  children,
  name,
  description,
  icon,
  backIcon,
  suffix,
  className,
  contentClassName,
  titleAlign = "left",
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const menuContext = useMenuContext();

  const defaultBackIcon = (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className="text-accent-primary"
    >
      <path d="M10 12L6 8L10 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );

  const chevronRightIcon = (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className="text-accent-primary"
    >
      <path d="M6 4L10 8L6 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );

  return (
    <>
      {/* Menu Item Button */}
      <button
        onClick={() => setIsOpen(true)}
        className={twJoin(
          "flex w-full items-center justify-between p-6",
          "transition-colors hover:bg-accent-secondary/5",
          "text-left focus:outline-none",
          className,
        )}
        role="menuitem"
      >
        <div className="flex items-center gap-3">
          {icon && <div className="flex-shrink-0">{icon}</div>}
          <div className="flex flex-col">
            <span className="text-sm font-medium text-accent-primary">{name}</span>
            {description && <span className="mt-0.5 text-xs text-accent-secondary">{description}</span>}
          </div>
        </div>
        {suffix || chevronRightIcon}
      </button>

      {/* Sliding Drawer */}
      <MenuDrawer
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        title={name || ""}
        titleAlign={titleAlign}
        backIcon={backIcon || defaultBackIcon}
        fullHeight={menuContext?.isMobile}
        fullWidth={menuContext?.isMobile}
        onBackdropClick={menuContext?.isMobile ? undefined : () => setIsOpen(false)}
        className={twJoin(menuContext?.isMobile ? "z-60" : "z-50", contentClassName)}
      >
        {children}
      </MenuDrawer>
    </>
  );
};
