import { useEffect, useRef, useState } from "react";

/**
 * Returns `true` only once `active` has stayed `true` continuously for
 * `delayMs`. Any flip back to `false` resets the timer.
 *
 * Used to defer the stale-price banner: a transient blip (a single failed RPC
 * read, or the brief gap before a faster poll lands) clears within the window
 * and never surfaces the banner, while a genuinely stale on-chain feed surfaces
 * it after the delay.
 */
export function useSustainedFlag(active: boolean, delayMs: number): boolean {
  const [reached, setReached] = useState(false);
  const activeSinceRef = useRef<number | null>(null);

  useEffect(() => {
    if (!active) {
      activeSinceRef.current = null;
      setReached(false);
      return;
    }

    if (activeSinceRef.current === null) {
      activeSinceRef.current = Date.now();
    }

    const remaining = delayMs - (Date.now() - activeSinceRef.current);
    if (remaining <= 0) {
      setReached(true);
      return;
    }

    const timer = setTimeout(() => setReached(true), remaining);
    return () => clearTimeout(timer);
  }, [active, delayMs]);

  return active && reached;
}
