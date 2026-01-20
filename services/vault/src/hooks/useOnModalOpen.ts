import { useEffect, useRef } from "react";

/**
 * Hook to execute a callback once when a modal transitions from closed to open.
 *
 * Handles React 18 Strict Mode by preventing duplicate executions.
 * Resets execution flag when modal closes, allowing re-execution on next open.
 *
 * @param open - Modal open state
 * @param onOpen - Callback to execute when modal opens
 */
export function useOnModalOpen(open: boolean, onOpen: () => void): void {
  const prevOpenRef = useRef(false);
  const hasExecutedRef = useRef(false);

  useEffect(() => {
    const justOpened = open && !prevOpenRef.current;

    if (justOpened && !hasExecutedRef.current) {
      // Mark as executed immediately to prevent duplicate calls (React 18 Strict Mode)
      hasExecutedRef.current = true;
      onOpen();
    }

    // Reset execution flag when modal closes
    if (!open && prevOpenRef.current) {
      hasExecutedRef.current = false;
    }

    // Update previous open state
    prevOpenRef.current = open;
    // onOpen is intentionally not in deps - we only want to execute on modal open transition
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
}
