import React, { useEffect, useId, useRef, useState } from "react";
import { twJoin } from "tailwind-merge";

import { Popover } from "../Popover";
import { MobileDialog } from "../Dialog";
import { MenuProvider } from "./MenuContext";
import { MenuDrawer } from "./MenuDrawer";
import { useIsMobile } from "@/hooks/useIsMobile";
import { useModalManager } from "@/hooks/useModalManager";
import { Placement } from "@popperjs/core";

interface MenuProps {
  children: React.ReactNode;
  trigger?: React.ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  placement?: Placement;
  offset?: [number, number];
  className?: string;
  /** `popover` keeps the dropdown on phones, drawn as the phone dropdown card. */
  mobileMode?: "drawer" | "dialog" | "popover";
}

const DESKTOP_POPOVER_CLASS =
  "rounded-lg border border-[#38708533] bg-surface shadow-lg dark:border-[#404040] min-w-[294px]";
// Figma strokes sit inside the frame, so 15px padding plus the 1px border is its 16px inset.
const PHONE_POPOVER_CLASS =
  "rounded-lg border border-secondary-strokeLight bg-background-secondary p-[15px] shadow-[0_8px_8px_rgba(0,0,0,0.12)]";
const PHONE_POPOVER_OFFSET: [number, number] = [0, 20];
const FOCUSABLE_SELECTOR = 'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])';

const focusCard = (card: HTMLDivElement | null) => card?.focus({ preventScroll: true });

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
  const isPhonePopover = isMobile && mobileMode === "popover";
  const triggerId = useId();

  const isOpen = controlledOpen !== undefined ? controlledOpen : internalOpen;
  const setIsOpen = (open: boolean) => {
    if (controlledOpen === undefined) {
      setInternalOpen(open);
    }
    onOpenChange?.(open);
  };

  const onClose = () => setIsOpen(false);

  const isPhonePopoverOpen = isPhonePopover && isOpen;
  const { unmount } = useModalManager({ open: isPhonePopoverOpen, onClose });
  const wasPhonePopoverOpen = useRef(false);

  useEffect(() => {
    if (isPhonePopoverOpen) {
      wasPhonePopoverOpen.current = true;
      return;
    }
    unmount();
    if (!wasPhonePopoverOpen.current) return;
    wasPhonePopoverOpen.current = false;
    // Focus left with the unmounted card; an outside tap that focused something else keeps it.
    if (document.activeElement === document.body) {
      triggerRef.current?.querySelector<HTMLElement>(FOCUSABLE_SELECTOR)?.focus();
    }
  }, [isPhonePopoverOpen, unmount]);

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
            "aria-haspopup": isPhonePopover ? "dialog" : "true",
            "aria-expanded": isOpen,
            ...(isPhonePopover && { id: triggerId }),
          })}
      </div>

      {isMobile && !isPhonePopover ? (
        mobileMode === "dialog" ? (
          <MobileDialog
            open={isOpen}
            onClose={onClose}
            className={twJoin(
              "bg-surface text-primary-main",
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
          offset={isPhonePopover ? PHONE_POPOVER_OFFSET : offset}
          placement={placement}
          onClickOutside={onClose}
          className={twJoin(isPhonePopover ? PHONE_POPOVER_CLASS : DESKTOP_POPOVER_CLASS, className)}
        >
          {isPhonePopover ? (
            <div
              ref={focusCard}
              role="dialog"
              aria-labelledby={triggerId}
              tabIndex={-1}
              className="relative w-full overflow-hidden focus:outline-none"
            >
              {children}
            </div>
          ) : (
            menuContent
          )}
        </Popover>
      )}
    </MenuProvider>
  );
};
