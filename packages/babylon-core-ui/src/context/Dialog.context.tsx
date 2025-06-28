import { type PropsWithChildren, createContext, useState, useMemo, useCallback, useEffect } from "react";
import { toPixels } from "@/utils/css";

interface DialogContext {
  removeDialog: (id: string, value?: boolean) => void;
  updateDialog: (id: string, value: boolean) => void;
}

export const DialogContext = createContext<DialogContext>({
  removeDialog: () => null,
  updateDialog: () => null,
});

export function ScrollLocker({ children }: PropsWithChildren) {
  const [dialogs, setDialogs] = useState<Record<string, boolean>>({});
  const bodyLocked = useMemo(() => Object.values(dialogs).some((v) => v), [dialogs]);

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

  const removeDialog = useCallback((id: string) => {
    setDialogs((state) => (Reflect.deleteProperty(state, id) ? { ...state } : state));
  }, []);

  const updateDialog = useCallback((id: string, value: boolean) => {
    setDialogs((state) => ({ ...state, [id]: value }));
  }, []);

  const value = useMemo(() => ({ removeDialog, updateDialog }), [removeDialog, updateDialog]);

  return <DialogContext.Provider value={value}>{children}</DialogContext.Provider>;
}
