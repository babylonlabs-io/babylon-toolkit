import { type DetailedHTMLProps, type HTMLAttributes } from "react";
import { twJoin } from "tailwind-merge";

import { Portal } from "@/components/Portal";
import { useModalManager } from "@/hooks/useModalManager";
import { Backdrop } from "./components/Backdrop";
import { CloseIcon } from "@/components/Icons";

export interface FullScreenDialogProps extends DetailedHTMLProps<HTMLAttributes<HTMLDivElement>, HTMLDivElement> {
  open?: boolean;
  onClose?: () => void;
}

export const FullScreenDialog = ({ children, open = false, className, onClose, ...restProps }: FullScreenDialogProps) => {
  const { mounted, unmount } = useModalManager({ open });

  return (
    <Portal mounted={mounted}>
      <div
        {...restProps}
        className={twJoin(
          "bbn-dialog-fullscreen",
          open ? "animate-modal-in" : "animate-modal-out",
          className,
        )}
        onAnimationEnd={unmount}
      >
        {onClose && (
          <button
            onClick={onClose}
            className="absolute top-4 left-4 z-10 flex h-8 w-8 items-center justify-center"
            aria-label="Close"
          >
            <CloseIcon size={16} variant="accent-primary" />
          </button>
        )}

        {children}
      </div>

      <Backdrop open={open} onClick={onClose} />
    </Portal>
  );
};
