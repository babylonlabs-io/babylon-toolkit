import { useReducedMotion } from "@babylonlabs-io/core-ui";
import { useEffect, useRef, useState } from "react";

/**
 * Fade wrapper that animates content in when the `stepKey` changes.
 */
export function FadeTransition({
  stepKey,
  children,
}: {
  stepKey: string;
  children: React.ReactNode;
}) {
  const reduced = useReducedMotion();
  // Initialize from `reduced` so the first paint is already final (no initial
  // fade/rise) for users who prefer reduced motion; otherwise start hidden and
  // let the effect fade the content in.
  const [visible, setVisible] = useState(reduced);
  const prevKey = useRef(stepKey);

  useEffect(() => {
    if (stepKey !== prevKey.current) {
      setVisible(false);
      prevKey.current = stepKey;
      if (reduced) {
        setVisible(true);
        return;
      }
      const raf = requestAnimationFrame(() => {
        requestAnimationFrame(() => setVisible(true));
      });
      return () => cancelAnimationFrame(raf);
    }
    setVisible(true);
  }, [stepKey, reduced]);

  return (
    <div
      className="w-full"
      style={{
        opacity: visible ? 1 : 0,
        transform: visible
          ? "translateY(0)"
          : "translateY(var(--motion-shift-reveal, 0px))",
        transition:
          "opacity var(--motion-duration-reveal, 150ms) var(--motion-ease-reveal, ease-out), transform var(--motion-duration-reveal, 150ms) var(--motion-ease-reveal, ease-out)",
      }}
    >
      {children}
    </div>
  );
}
