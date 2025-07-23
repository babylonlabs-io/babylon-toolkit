import React, { useState, useRef } from "react";
import { twJoin } from "tailwind-merge";

import { Popover } from "../Popover";
import { MobileDialog } from "../Dialog";
import { MenuProvider } from "./MenuContext";
import { MenuDrawer } from "./MenuDrawer";
import { useIsMobile } from "@/hooks/useIsMobile";
import { Placement } from "@popperjs/core";

interface MenuProps {
  children: React.ReactNode;
  trigger?: React.ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  placement?: Placement;
  offset?: [number, number];
  className?: string;
  mobileMode?: "drawer" | "dialog";
}

export const Menu: React.FC<MenuProps> = ({
  children,
  trigger,
  open: controlledOpen,
  onOpenChange,
  placement = "bottom-end",
  offset = [0, 8],
  className,
  mobileMode = "dialog",
}) => {
  const [internalOpen, setInternalOpen] = useState(false);
  const triggerRef = useRef<HTMLDivElement>(null);
  const isMobile = useIsMobile();

  const isOpen = controlledOpen !== undefined ? controlledOpen : internalOpen;
  const setIsOpen = (open: boolean) => {
    if (controlledOpen === undefined) {
      setInternalOpen(open);
    }
    onOpenChange?.(open);
  };

  const onClose = () => setIsOpen(false);

  const menuContent = <div className="relative w-full overflow-hidden">{children}</div>;

  const triggerElement = trigger || (
    <button className="rounded p-2 hover:bg-gray-100 dark:hover:bg-gray-800" onClick={() => setIsOpen(!isOpen)}>
      Menu
    </button>
  );

  return (
    <MenuProvider value={{ isOpen, setIsOpen, onClose, isMobile }}>
      <div ref={triggerRef} className="inline-block">
        {React.isValidElement(triggerElement) &&
          React.cloneElement(triggerElement as React.ReactElement, {
            onClick: () => setIsOpen(!isOpen),
            "aria-haspopup": "true",
            "aria-expanded": isOpen,
          })}
      </div>

      {isMobile ? (
        mobileMode === "dialog" ? (
          <MobileDialog
            open={isOpen}
            onClose={onClose}
            className={twJoin(
              "relative bg-[#FFFFFF] dark:bg-[#252525] text-primary-main",
              className
            )}
          >
            {menuContent}
          </MobileDialog>
        ) : (
          <MenuDrawer
            isOpen={isOpen}
            onClose={onClose}
            onBackdropClick={onClose}
            fullHeight={true}
            fullWidth={true}
            showBackButton={true}
            showDivider={false}
          >
            {menuContent}
          </MenuDrawer>
        ) 
      ) : (
        <Popover
          anchorEl={triggerRef.current}
          open={isOpen}
          offset={offset}
          placement={placement}
          onClickOutside={onClose}
          className={twJoin(
            "rounded-lg border border-[#38708533] bg-[#FFFFFF] shadow-lg dark:border-[#404040] dark:bg-[#252525]",
            "min-w-[294px]",
            className,
          )}
        >
          {menuContent}
        </Popover>
      )}
    </MenuProvider>
  );
};
