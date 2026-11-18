import { useReducedMotion } from "@babylonlabs-io/core-ui";
import { useEffect, useRef, useState } from "react";

const CREEP_TICK_MS = 250;
/** Furthest the shown value runs ahead of the real one, as a share of the total. */
const CREEP_MAX_LEAD = 0.1;
/** The creep alone never shows the download as finished. */
const CREEP_MAX_SHARE = 0.99;
/** Time to cover half of the remaining lead; the creep slows as it nears the cap. */
const CREEP_HALF_LIFE_MS = 20_000;
const CREEP_STEP = 1 - 2 ** (-CREEP_TICK_MS / CREEP_HALF_LIFE_MS);

/**
 * Bytes to show for a download whose bytes arrive in bursts: the provider
 * sends nothing while it prepares each session. Never behind the real value,
 * never more than CREEP_MAX_LEAD ahead of it, and never decreasing unless the
 * real value restarts or the total changes. Under reduced motion it is the
 * real value.
 */
export function useCreepingProgress(received: number, total: number): number {
  const reduced = useReducedMotion();
  const [shown, setShown] = useState(received);
  const lastReceived = useRef(received);

  useEffect(() => {
    const restarted = received < lastReceived.current;
    lastReceived.current = received;
    setShown((prev) => (restarted ? received : Math.max(prev, received)));
  }, [received]);

  useEffect(() => {
    // A retry resets the total before any byte arrives, so drop the old creep.
    setShown(lastReceived.current);
    if (reduced || total <= 0) return;
    const timer = setInterval(() => {
      setShown((prev) => {
        const ceiling = Math.min(
          total * CREEP_MAX_SHARE,
          lastReceived.current + total * CREEP_MAX_LEAD,
        );
        return prev >= ceiling ? prev : prev + (ceiling - prev) * CREEP_STEP;
      });
    }, CREEP_TICK_MS);
    return () => clearInterval(timer);
  }, [total, reduced]);

  return reduced ? received : Math.max(shown, received);
}
