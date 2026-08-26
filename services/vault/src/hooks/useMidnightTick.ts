import { useEffect, useState } from "react";

/**
 * Forces a re-render at the next local midnight, then reschedules for each
 * following midnight. Use it where the UI is derived from the current calendar
 * day (e.g. the activity "Today" / "Yesterday" date-group headers): the
 * activity feed does not poll, so an idle page would otherwise keep yesterday's
 * labels until an unrelated render. Returns a counter that increments each
 * midnight (usually unused — subscribing to the hook is the point).
 */
export function useMidnightTick(): number {
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const now = new Date();
    const nextMidnight = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate() + 1,
      0,
      0,
      0,
      0,
    ).getTime();
    const id = setTimeout(
      () => setTick((t) => t + 1),
      nextMidnight - now.getTime(),
    );
    return () => clearTimeout(id);
  }, [tick]);

  return tick;
}
