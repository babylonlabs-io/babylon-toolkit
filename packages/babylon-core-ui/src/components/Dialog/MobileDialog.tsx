import { type DetailedHTMLProps, type HTMLAttributes } from "react";
import { twJoin } from "tailwind-merge";

import { Portal } from "@/components/Portal";
import { useModalManager } from "@/hooks/useModalManager";
import { Backdrop } from "./components/Backdrop";
import { CloseIcon } from "@/components/Icons";

export interface MobileDialogProps extends DetailedHTMLProps<HTMLAttributes<HTMLDivElement>, HTMLDivElement> {
  open?: boolean;
  onClose?: () => void;
  disableEscapeClose?: boolean;
  /** Shows a drag-handle bar in place of the visible close button; the button stays for screen readers. */
  handle?: boolean;
  backdropClassName?: string;
}

export const MobileDialog = ({
  children,
  open = false,
  className,
  onClose,
  disableEscapeClose,
  handle = false,
  backdropClassName,
  ...restProps
}: MobileDialogProps) => {
  const { mounted, unmount } = useModalManager({ open, onClose, disableEscapeClose });

  return (
    <Portal mounted={mounted}>
      <div
        {...restProps}
        className={twJoin(
          "bbn-dialog-mobile",
          open ? "animate-mobile-modal-in" : "animate-mobile-modal-out",
          className,
        )}
        onAnimationEnd={unmount}
      >
        {handle && (
          <span
            aria-hidden="true"
            className="absolute left-1/2 top-1.5 h-[3px] w-6 -translate-x-1/2 rounded-full bg-accent-primary opacity-[0.24]"
          />
        )}
        {onClose && (
          <button
            onClick={onClose}
            className={
              handle
                ? "sr-only"
                : "absolute top-4 left-4 z-10 p-1.5 rounded-full bg-surface-tertiary hover:bg-surface-quaternary transition-colors before:absolute before:-inset-[7px] before:content-['']"
            }
            aria-label="Close"
          >
            <CloseIcon size={14} variant="accent-primary" />
          </button>
        )}
        
        {children}
      </div>

      <Backdrop open={open} onClick={onClose} className={backdropClassName} />
    </Portal>
  );
};
