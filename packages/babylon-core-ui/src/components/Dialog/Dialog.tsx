import { type DetailedHTMLProps, type HTMLAttributes } from "react";
import { twJoin } from "tailwind-merge";

import { Portal } from "@/components/Portal";
import { useModalManager } from "@/hooks/useModalManager";
import { Backdrop } from "./components/Backdrop";

export interface DialogProps extends DetailedHTMLProps<HTMLAttributes<HTMLDivElement>, HTMLDivElement> {
  open?: boolean;
  onClose?: () => void;
  hasBackdrop?: boolean;
  backdropClassName?: string;
  dialogClassName?: string;
  disableEscapeClose?: boolean;
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
  ...restProps
}: DialogProps) => {
  const { mounted, unmount } = useModalManager({ open, onClose, disableEscapeClose });

  return (
    <Portal mounted={mounted}>
      {/* The testid is a default, so it must precede the spread: after it, a
          caller passing its own `data-testid` is silently overridden here and
          cannot address its dialog at all. MobileDialog already spreads last,
          so the two rendered the same dialog under different testids. */}
      <div data-testid="dialog-wrapper" {...restProps} className={twJoin("bbn-dialog-wrapper", className)}>
        <div
          className={twJoin("bbn-dialog", open ? "animate-modal-in" : "animate-modal-out", dialogClassName)}
          onAnimationEnd={unmount}
          role="dialog"
          data-testid="dialog"
        >
          {children}
        </div>
      </div>

      {hasBackdrop && <Backdrop className={backdropClassName} open={open} onClick={onClose} />}
    </Portal>
  );
};
