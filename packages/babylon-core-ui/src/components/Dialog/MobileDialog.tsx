import { type DetailedHTMLProps, type HTMLAttributes } from "react";
import { twJoin } from "tailwind-merge";

import { Portal } from "@/components/Portal";
import { useModalManager } from "@/hooks/useModalManager";
import { Backdrop } from "./components/Backdrop";

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
        {children}
      </div>

      <Backdrop open={open} onClick={onClose} />
    </Portal>
  );
};
