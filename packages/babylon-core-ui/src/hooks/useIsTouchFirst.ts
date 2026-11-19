import { useEffect, useState } from "react";

// `any-hover`, not `hover`: a touch laptop has a coarse primary pointer but a
// trackpad or mouse that hovers, so it is not touch-first.
const TOUCH_FIRST_QUERY = "(pointer: coarse) and (any-hover: none)";

const supportsMatchMedia = () => typeof window !== "undefined" && typeof window.matchMedia === "function";

export const isTouchFirstNow = () => supportsMatchMedia() && window.matchMedia(TOUCH_FIRST_QUERY).matches;

/** Tracks whether the primary input is touch and no input can hover (a phone or tablet). */
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
