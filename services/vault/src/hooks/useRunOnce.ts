import { useEffect, useRef } from "react";

/**
 * Execute a callback exactly once on mount.
 * Prevents re-execution on dependency changes or React strict mode double-mounts.
 */
export function useRunOnce(callback: () => void) {
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    callback();
  }, [callback]);
}
