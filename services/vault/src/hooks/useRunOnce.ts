import { useEffect, useRef } from "react";

/**
 * Execute a callback exactly once on mount.
 * Prevents re-execution on dependency changes or React strict mode double-mounts.
 * Supports both sync and async callbacks.
 */
export function useRunOnce(callback: () => void | Promise<void>) {
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const result = callback();
    if (result instanceof Promise) {
      result.catch(console.error);
    }
  }, [callback]);
}
