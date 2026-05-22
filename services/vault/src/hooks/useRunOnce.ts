import { useEffect, useRef } from "react";

import { logger } from "@/infrastructure";

/**
 * Execute a callback exactly once, the first time `enabled` is true.
 *
 * Prevents re-execution on dependency changes or React strict mode double-mounts.
 * Supports both sync and async callbacks.
 *
 * `enabled` lets callers defer the run until a precondition holds (e.g. the
 * wallet has finished hydrating). It still runs at most once: once it fires, it
 * never fires again even if `enabled` toggles. Defaults to `true` so existing
 * "run on mount" callers are unaffected.
 */
export function useRunOnce(
  callback: () => void | Promise<void>,
  enabled: boolean = true,
) {
  const started = useRef(false);
  useEffect(() => {
    if (started.current || !enabled) return;
    started.current = true;
    const result = callback();
    if (result instanceof Promise) {
      result.catch((err) =>
        logger.error(err instanceof Error ? err : new Error(String(err)), {
          data: { context: "useRunOnce callback" },
        }),
      );
    }
  }, [callback, enabled]);
}
