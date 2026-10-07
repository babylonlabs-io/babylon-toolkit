import { useEffect, useState } from "react";

const TOUCH_FIRST_QUERY = "(pointer: coarse) and (hover: none)";

const supportsMatchMedia = () => typeof window !== "undefined" && typeof window.matchMedia === "function";

export const isTouchFirstNow = () => supportsMatchMedia() && window.matchMedia(TOUCH_FIRST_QUERY).matches;

/** Tracks whether the primary input is touch without hover (a phone or tablet). */
export function useIsTouchFirst(): boolean {
  const [touchFirst, setTouchFirst] = useState(isTouchFirstNow);

  useEffect(() => {
    if (!supportsMatchMedia()) return;

    const mql = window.matchMedia(TOUCH_FIRST_QUERY);
    const onChange = () => setTouchFirst(mql.matches);

    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, []);

  return touchFirst;
}
