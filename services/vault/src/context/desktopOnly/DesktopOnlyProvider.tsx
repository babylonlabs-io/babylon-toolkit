import { useCallback, useMemo, useState, type PropsWithChildren } from "react";

import { ContinueOnDesktopDialog } from "@/components/Wallet/ContinueOnDesktopDialog";
import { createStateUtils } from "@/utils/createStateUtils";

interface DesktopOnlyState {
  open: boolean;
  show: () => void;
  hide: () => void;
}

const { StateProvider, useState: useDesktopOnlyState } =
  createStateUtils<DesktopOnlyState>({
    open: false,
    show: () => {},
    hide: () => {},
  });

export function DesktopOnlyProvider({ children }: PropsWithChildren) {
  const [open, setOpen] = useState(false);
  const show = useCallback(() => setOpen(true), []);
  const hide = useCallback(() => setOpen(false), []);
  const context = useMemo(() => ({ open, show, hide }), [open, show, hide]);

  return (
    <StateProvider value={context}>
      {children}
      <ContinueOnDesktopDialog open={open} onClose={hide} />
    </StateProvider>
  );
}

export const useDesktopOnly = useDesktopOnlyState;
