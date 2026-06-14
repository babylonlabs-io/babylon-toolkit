import { type PropsWithChildren, createContext, useState, useMemo, useCallback, useEffect, useRef } from "react";
import { toPixels } from "@/utils/css";

const ESCAPE_KEY = "Escape";

export interface DialogOptions {
  open: boolean;
  visible: boolean;
  onClose?: () => void;
  disableEscapeClose?: boolean;
}

interface DialogEntry extends DialogOptions {
  order: number;
}

interface DialogContextValue {
  removeDialog: (id: string) => void;
  updateDialog: (id: string, options: DialogOptions) => void;
}

export const DialogContext = createContext<DialogContextValue>({
  removeDialog: () => null,
  updateDialog: () => null,
});

export function ScrollLocker({ children }: PropsWithChildren) {
  const [visibleIds, setVisibleIds] = useState<Record<string, true>>({});
  const entriesRef = useRef<Map<string, DialogEntry>>(new Map());
  const orderRef = useRef(0);

  const bodyLocked = useMemo(() => Object.keys(visibleIds).length > 0, [visibleIds]);

  useEffect(
    function lockBody() {
      if (bodyLocked) {
        const width = document.body.offsetWidth;
        document.body.style.overflow = "hidden";
        document.body.style.paddingRight =
          document.body.offsetWidth - width >= 1
            ? (toPixels(document.body.offsetWidth - width) ?? "")
            : document.body.style.paddingRight;
      } else {
        document.body.style.overflow = "";
        document.body.style.paddingRight = "";
      }
    },
    [bodyLocked],
  );

  useEffect(function closeTopmostOnEscape() {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== ESCAPE_KEY || event.defaultPrevented) return;

      let topmost: DialogEntry | undefined;
      for (const entry of entriesRef.current.values()) {
        if (!entry.open) continue;
        if (!topmost || entry.order > topmost.order) topmost = entry;
      }

      if (topmost?.onClose && !topmost.disableEscapeClose) {
        event.preventDefault();
        topmost.onClose();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  const removeDialog = useCallback((id: string) => {
    entriesRef.current.delete(id);
    setVisibleIds((state) => {
      if (!(id in state)) return state;
      const next = { ...state };
      delete next[id];
      return next;
    });
  }, []);

  const updateDialog = useCallback((id: string, { open, visible, onClose, disableEscapeClose }: DialogOptions) => {
    const previous = entriesRef.current.get(id);
    const wasVisible = previous?.visible ?? false;
    const order = visible && !wasVisible ? (orderRef.current += 1) : (previous?.order ?? 0);

    entriesRef.current.set(id, { open, visible, onClose, disableEscapeClose, order });

    if (wasVisible === visible) return;

    setVisibleIds((state) => {
      if (visible) return { ...state, [id]: true };
      if (!(id in state)) return state;
      const next = { ...state };
      delete next[id];
      return next;
    });
  }, []);

  const value = useMemo(() => ({ removeDialog, updateDialog }), [removeDialog, updateDialog]);

  return <DialogContext.Provider value={value}>{children}</DialogContext.Provider>;
}
