import { type DetailedHTMLProps, type HTMLAttributes } from "react";
import { twJoin } from "tailwind-merge";

import { Portal } from "@/components/Portal";
import { CloseIcon } from "@/components/Icons";
import { useModalManager } from "@/hooks/useModalManager";
import { Backdrop } from "./components/Backdrop";

export interface DialogProps extends DetailedHTMLProps<HTMLAttributes<HTMLDivElement>, HTMLDivElement> {
  open?: boolean;
  onClose?: () => void;
  hasBackdrop?: boolean;
  backdropClassName?: string;
  dialogClassName?: string;
  disableEscapeClose?: boolean;
  mobile?: boolean;
  /** Show a handle instead of the visible close button. */
  handle?: boolean;
}

export const Dialog = ({
  children,
  open = false,
  className,
  onClose,
  hasBackdrop = true,
  backdropClassName,
  dialogClassName,
  disableEscapeClose,
  mobile = false,
  handle = false,
  ...restProps
}: DialogProps) => {
  const { mounted, unmount } = useModalManager({ open, onClose, disableEscapeClose });

  return (
    <Portal mounted={mounted}>
      <div
        data-testid="dialog-wrapper"
        {...restProps}
        className={twJoin(
          mobile ? "bbn-dialog-mobile" : "bbn-dialog-wrapper",
          mobile && (open ? "animate-mobile-modal-in" : "animate-mobile-modal-out"),
          className,
        )}
        onAnimationEnd={mobile ? unmount : restProps.onAnimationEnd}
      >
        <div
          className={
            mobile ? "contents" : twJoin("bbn-dialog", open ? "animate-modal-in" : "animate-modal-out", dialogClassName)
          }
          onAnimationEnd={mobile ? undefined : unmount}
          role={mobile ? undefined : "dialog"}
          data-testid="dialog"
        >
          {mobile && handle && (
            <span
              aria-hidden="true"
              className="absolute left-1/2 top-1.5 h-[3px] w-6 -translate-x-1/2 rounded-full bg-accent-primary opacity-[0.24]"
            />
          )}
          {mobile && onClose && (
            <button
              onClick={onClose}
              className={
                handle
                  ? "sr-only"
                  : "bg-surface-tertiary hover:bg-surface-quaternary absolute left-4 top-4 z-10 rounded-full p-1.5 transition-colors before:absolute before:-inset-[7px] before:content-['']"
              }
              aria-label="Close"
            >
              <CloseIcon size={14} variant="accent-primary" />
            </button>
          )}
          {children}
        </div>
      </div>

      {(mobile || hasBackdrop) && <Backdrop className={backdropClassName} open={open} onClick={onClose} />}
    </Portal>
  );
};
