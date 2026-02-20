import { useEffect, useRef } from "react";

/**
 * Manages dialog step lifecycle: freezes the rendered step during the close
 * animation to prevent content flashes, and resets state when the dialog reopens.
 *
 * @param open    Whether the dialog is currently open
 * @param step    The current step value from state
 * @param reset   Callback to reset the step state (called on reopen)
 * @returns       The step value to use for rendering (frozen during close)
 */
export function useDialogStep<T>(open: boolean, step: T, reset: () => void): T {
  // Reset state when the dialog transitions from closed → open.
  // Doing this on open (not close) avoids changing content during
  // the close animation.
  const prevOpen = useRef(open);
  useEffect(() => {
    if (open && !prevOpen.current) {
      reset();
    }
    prevOpen.current = open;
  }, [open, reset]);

  // Freeze the rendered step while the dialog is closing.
  // Only update when `open` is true so the content stays stable
  // during the close animation.
  const frozenRef = useRef(step);
  if (open) {
    frozenRef.current = step;
  }

  return frozenRef.current;
}
