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
        className={twJoin(
          "bbn-dialog-fullscreen",
          open ? "animate-modal-in" : "animate-modal-out",
        )}
        onAnimationEnd={unmount}
      >
        {onClose && (
          <button
            onClick={onClose}
            className="fixed top-4 left-4 z-10 flex h-8 w-8 items-center justify-center"
            aria-label="Close"
          >
            <CloseIcon size={16} variant="accent-primary" />
          </button>
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
