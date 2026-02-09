import { useEffect } from "react";

interface UseVisibilityCheckOptions {
  /** Whether the visibility check is enabled */
  enabled: boolean;
  /** Delay in ms before running the check (default: 500) */
  delay?: number;
}

/**
 * Runs a callback when the document becomes visible.
 * Useful for checking wallet connections when user returns to the tab.
 */
export function useVisibilityCheck(
  onVisible: () => void | Promise<void>,
  options: UseVisibilityCheckOptions,
) {
  const { enabled, delay = 500 } = options;

  useEffect(() => {
    if (!enabled) return;
    if (typeof window === "undefined" || typeof document === "undefined") return;

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        setTimeout(onVisible, delay);
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [enabled, onVisible, delay]);
}
