import { type DetailedHTMLProps, type HTMLAttributes, type ReactNode } from "react";
import { twJoin, twMerge } from "tailwind-merge";

import { Portal } from "@/components/Portal";
import { useModalManager } from "@/hooks/useModalManager";
import { Backdrop } from "./components/Backdrop";
import { ChevronLeftIcon, CloseIcon } from "@/components/Icons";

export interface FullScreenDialogProps extends DetailedHTMLProps<HTMLAttributes<HTMLDivElement>, HTMLDivElement> {
  open?: boolean;
  onClose?: () => void;
  /**
   * When provided, the top-left button becomes a back affordance (chevron) that
   * calls this handler instead of closing. Escape/backdrop still call onClose.
   */
  onBack?: () => void;
  disableEscapeClose?: boolean;
  /** Optional content rendered top-right, mirroring the close/back button. */
  actions?: ReactNode;
  /** Overrides the default `left-4` position of the close/back button. */
  closeButtonClassName?: string;
  /** Overrides the default `right-4` position of the `actions` slot. */
  actionsClassName?: string;
}

export const FullScreenDialog = ({
  children,
  open = false,
  className,
  onClose,
  onBack,
  disableEscapeClose,
  actions,
  closeButtonClassName,
  actionsClassName,
  ...restProps
}: FullScreenDialogProps) => {
  const { mounted, unmount } = useModalManager({ open, onClose, disableEscapeClose });

  return (
    <Portal mounted={mounted}>
      <div
        className={twJoin(
          "bbn-dialog-fullscreen",
          open ? "animate-modal-in" : "animate-modal-out",
        )}
        onAnimationEnd={unmount}
      >
        {onBack ? (
          <button
            onClick={onBack}
            className={twMerge(
              "fixed top-4 left-4 z-10 flex h-8 w-8 items-center justify-center",
              closeButtonClassName,
            )}
            aria-label="Back"
          >
            <ChevronLeftIcon size={20} variant="accent-primary" />
          </button>
        ) : (
          onClose && (
            <button
              onClick={onClose}
              className={twMerge(
                "fixed top-4 left-4 z-10 flex h-8 w-8 items-center justify-center",
                closeButtonClassName,
              )}
              aria-label="Close"
            >
              <CloseIcon size={16} variant="accent-primary" />
            </button>
          )
        )}

        {actions && (
          <div
            className={twMerge(
              "fixed top-4 right-4 z-10 flex items-center",
              actionsClassName,
            )}
          >
            {actions}
          </div>
        )}

        <div
          {...restProps}
          className={twJoin("flex min-h-full w-full flex-col", className)}
        >
          {children}
        </div>
      </div>

      <Backdrop open={open} onClick={onClose} />
    </Portal>
  );
};
