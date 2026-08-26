import { useState, useEffect } from "react";

interface Dimentions {
  width: number;
  height: number;
}

export function useResizeObserver<E extends HTMLElement>(element?: E | null) {
  const [dimentions, setDimentions] = useState<Dimentions>({ width: 0, height: 0 });

  useEffect(() => {
    if (!element) {
      setDimentions({ width: 0, height: 0 });
      return;
    }

    const observer = new ResizeObserver(([entry]) => {
      setDimentions({
        width: entry.target.clientWidth,
        height: entry.target.clientHeight,
      });
    });

    observer.observe(element);

    return () => {
      observer.unobserve(element);
    };
  }, [element]);

  return dimentions;
}
