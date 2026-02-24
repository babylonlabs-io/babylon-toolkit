import { useEffect } from "react";

/**
 * Execute a callback exactly once on mount.
 * Supports both sync and async callbacks.
 * Uses cleanup-based cancellation to handle React StrictMode double-mounts,
 * and catches unhandled rejections from async callbacks.
 */
export function useRunOnce(callback: () => void | Promise<void>) {
  useEffect(() => {
    let cancelled = false;

    const result = callback();
    if (result instanceof Promise) {
      result.catch((err) => {
        if (!cancelled) {
          console.error("[useRunOnce] Unhandled error:", err);
        }
      });
    }

    return () => {
      cancelled = true;
    };
  }, [callback]);
}
