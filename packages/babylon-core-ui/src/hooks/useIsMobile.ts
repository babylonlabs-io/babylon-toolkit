import { useState, useEffect, useCallback, useRef } from "react";
import throttle from "lodash.throttle";

/**
 * Hook to detect if the viewport is in mobile size
 * @param breakpoint - The breakpoint in pixels (default: 768)
 * @param throttleMs - The throttle delay in milliseconds (default: 100)
 * @returns boolean indicating if viewport is mobile size
 */
export function useIsMobile(breakpoint: number = 768, throttleMs: number = 100): boolean {
  const [isMobile, setIsMobile] = useState(() => {
    // Initial state based on current window width
    if (typeof window !== "undefined") {
      return window.innerWidth < breakpoint;
    }
    return false;
  });

  const throttledCheckMobile = useRef<ReturnType<typeof throttle>>();

  const checkMobile = useCallback(() => {
    setIsMobile(window.innerWidth < breakpoint);
  }, [breakpoint]);

  useEffect(() => {
    throttledCheckMobile.current = throttle(checkMobile, throttleMs);
    checkMobile();
    window.addEventListener("resize", throttledCheckMobile.current);

    return () => {
      if (throttledCheckMobile.current) {
        window.removeEventListener("resize", throttledCheckMobile.current);
        throttledCheckMobile.current.cancel();
      }
    };
  }, [checkMobile, throttleMs]);

  return isMobile;
}
