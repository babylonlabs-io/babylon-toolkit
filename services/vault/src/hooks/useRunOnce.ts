import { useEffect, useRef } from "react";

/**
 * Execute a callback exactly once on mount.
 * Supports both sync and async callbacks.
 * Prevents re-execution on dependency changes or React strict mode double-mounts.
 */
export function useRunOnce(callback: () => void | Promise<void>) {
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;

    const result = callback();
    if (result instanceof Promise) {
      result.catch((err) => {
        console.error("[useRunOnce] Unhandled error:", err);
      });
    }
  }, [callback]);
}
