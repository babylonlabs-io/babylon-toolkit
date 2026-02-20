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
  const [visible, setVisible] = useState(false);
  const prevKey = useRef(stepKey);

  useEffect(() => {
    if (stepKey !== prevKey.current) {
      // New step: start invisible, then fade in
      setVisible(false);
      prevKey.current = stepKey;
      const raf = requestAnimationFrame(() => {
        requestAnimationFrame(() => setVisible(true));
      });
      return () => cancelAnimationFrame(raf);
    } else {
      // Initial mount
      setVisible(true);
    }
  }, [stepKey]);

  return (
    <div
      className="w-full transition-opacity duration-300 ease-in-out"
      style={{ opacity: visible ? 1 : 0 }}
    >
      {children}
    </div>
  );
}
