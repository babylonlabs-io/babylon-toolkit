import { DialogContext } from "@/context/Dialog.context";
import { useCallback, useContext, useEffect, useId, useState } from "react";

interface Options {
  open?: boolean;
  onClose?: () => void;
  disableEscapeClose?: boolean;
  unmountOnClose?: boolean;
}

export function useModalManager({ open = false, onClose, disableEscapeClose }: Options = {}) {
  const modalId = useId();
  const [mounted, setMounted] = useState(open);
  const { updateDialog, removeDialog } = useContext(DialogContext);
  const visible = open || mounted;

  useEffect(
    () => () => {
      removeDialog(modalId);
    },
    [modalId],
  );

  useEffect(() => {
    updateDialog(modalId, { visible, onClose, disableEscapeClose });
  }, [modalId, visible, onClose, disableEscapeClose, updateDialog]);

  useEffect(() => {
    if (open) {
      setMounted(true);
    }
  }, [open]);

  const unmount = useCallback(() => {
    if (!open) {
      setMounted(false);
    }
  }, [open]);

  return {
    mounted,
    unmount,
  };
}
