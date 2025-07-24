import React from "react";
import { twJoin } from "tailwind-merge";
import { Portal } from "../Portal";

interface MenuDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  className?: string;
  titleAlign?: "left" | "center" | "right";
  backIcon?: React.ReactNode;
  fullHeight?: boolean;
  fullWidth?: boolean;
  showBackButton?: boolean;
  showDivider?: boolean;
  onBackdropClick?: () => void;
}

export const MenuDrawer: React.FC<MenuDrawerProps> = ({
  isOpen,
  onClose,
  title,
  children,
  className = "",
  titleAlign = "left",
  backIcon,
  fullHeight = false,
  fullWidth = false,
  showBackButton = true,
  showDivider = true,
  onBackdropClick,
}) => {

  const titleAlignment = {
    left: "text-left",
    center: "text-center",
    right: "text-right",
  };

  const renderHeader = () => {
    if (!(showBackButton || title)) return null;
    return (
      <div
        className={twJoin(
          "flex items-center p-4",
          showDivider && "border-b border-[#38708533] dark:border-[#404040]",
        )}
      >
        {showBackButton && (
          <button
            onClick={onClose}
            className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded transition-colors hover:bg-accent-secondary/10"
            aria-label="Go back"
          >
            {backIcon || (
              <svg
                width="16"
                height="16"
                viewBox="0 0 16 16"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
                className="text-accent-primary"
              >
                <path
                  d="M10 12L6 8L10 4"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            )}
          </button>
        )}
        {title && (
          <h3
            className={twJoin(
              "flex-1 text-sm font-medium text-accent-primary",
              showBackButton ? "ml-3" : "",
              titleAlignment[titleAlign],
            )}
          >
            {title}
          </h3>
        )}
      </div>
    );
  };

  const renderContent = () => (
    <>
      {renderHeader()}
      <div className="flex-1 overflow-y-auto">{children}</div>
    </>
  );

  // For fullHeight drawers (mobile), use Portal to ensure proper theme sync
  if (fullHeight) {
    return (
      <Portal mounted rootClassName="menu-drawer-portal">
        {onBackdropClick && (
          <div
            className={twJoin(
              "fixed inset-0 z-40 bg-black/50 transition-opacity duration-300",
              isOpen ? "opacity-100" : "pointer-events-none opacity-0",
            )}
            onClick={onBackdropClick}
          />
        )}

        <div
          className={twJoin(
            "transform transition-transform duration-300 ease-in-out",
            "bg-[#FFFFFF] dark:bg-[#252525]",
            "fixed inset-y-0 right-0 z-50",
            fullWidth ? "w-full" : "w-full max-w-sm",
            isOpen ? "translate-x-0" : "translate-x-full",
            className,
          )}
        >
          {renderContent()}
        </div>
      </Portal>
    );
  }

  // For non-fullHeight drawers (desktop), render normally
  return (
    <div
      className={twJoin(
        "transform transition-transform duration-300 ease-in-out",
        "bg-[#FFFFFF] dark:bg-[#252525]",
        "absolute inset-0 rounded-lg",
        isOpen ? "translate-x-0" : "translate-x-full",
        className,
      )}
    >
      {renderContent()}
    </div>
  );
};
