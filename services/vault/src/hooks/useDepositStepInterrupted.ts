import { useCallback, useLayoutEffect, useRef, useState } from "react";

/**
 * Whether the wallet disconnected while the deposit view was open. The page
 * unmounts that view in the same render, so the view cannot report it itself.
 */
export function useDepositStepInterrupted(isConnected: boolean): {
  isInterrupted: boolean;
  onDepositViewChange: (open: boolean) => void;
} {
  const isViewOpen = useRef(false);
  const [isInterrupted, setIsInterrupted] = useState(false);

  const onDepositViewChange = useCallback((open: boolean) => {
    isViewOpen.current = open;
  }, []);

  // A layout effect, so it reads the flag before the unmounting view's passive
  // cleanup reports the view closed.
  useLayoutEffect(() => {
    if (isConnected) {
      setIsInterrupted(false);
      return;
    }
    if (isViewOpen.current) {
      isViewOpen.current = false;
      setIsInterrupted(true);
    }
  }, [isConnected]);

  return { isInterrupted, onDepositViewChange };
}
