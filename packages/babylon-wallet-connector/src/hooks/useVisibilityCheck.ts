import { useEffect, useRef } from "react";

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
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!enabled) return;
    if (typeof window === "undefined" || typeof document === "undefined") return;

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        // Clear any existing timeout before scheduling a new one
        if (timeoutRef.current) {
          clearTimeout(timeoutRef.current);
        }
        timeoutRef.current = setTimeout(() => {
          // Wrap async callback to catch unhandled rejections
          Promise.resolve(onVisible()).catch((error) => {
            console.error("Error in visibility check callback:", error);
          });
        }, delay);
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      // Clear pending timeout on cleanup
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    };
  }, [enabled, onVisible, delay]);
}
