import { useEffect, useState } from "react";

const QUERY = "(prefers-reduced-motion: reduce)";

const supportsMatchMedia = () => typeof window !== "undefined" && typeof window.matchMedia === "function";

/** Tracks the user's `prefers-reduced-motion` setting reactively. */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() => supportsMatchMedia() && window.matchMedia(QUERY).matches);

  useEffect(() => {
    if (!supportsMatchMedia()) return;

    const mql = window.matchMedia(QUERY);
    const onChange = () => setReduced(mql.matches);

    // Prefer the modern listener API; fall back to the deprecated one (older Safari).
    if (typeof mql.addEventListener === "function") {
      mql.addEventListener("change", onChange);
      return () => mql.removeEventListener("change", onChange);
    }

    mql.addListener(onChange);
    return () => mql.removeListener(onChange);
  }, []);

  return reduced;
}
