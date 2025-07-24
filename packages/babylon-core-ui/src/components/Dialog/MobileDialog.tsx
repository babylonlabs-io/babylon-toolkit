import { type DetailedHTMLProps, type HTMLAttributes } from "react";
import { twJoin } from "tailwind-merge";

import { Portal } from "@/components/Portal";
import { useModalManager } from "@/hooks/useModalManager";
import { Backdrop } from "./components/Backdrop";
import { CloseIcon } from "@/components/Icons";

export interface MobileDialogProps extends DetailedHTMLProps<HTMLAttributes<HTMLDivElement>, HTMLDivElement> {
  open?: boolean;
  onClose?: () => void;
}

export const MobileDialog = ({ children, open = false, className, onClose, ...restProps }: MobileDialogProps) => {
  const { mounted, unmount } = useModalManager({ open });

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
        {/* Close button */}
        {onClose && (
          <button
            onClick={onClose}
            className="absolute top-4 left-4 z-10 p-1.5 rounded-full bg-surface-tertiary hover:bg-surface-quaternary transition-colors"
            aria-label="Close"
          >
            <CloseIcon size={14} variant="accent-primary" />
          </button>
        )}
        
        {children}
      </div>

      <Backdrop open={open} onClick={onClose} />
    </Portal>
  );
};
