import { useMemo } from "react";
import type { Position } from "./types";

export type { Position };

export function usePosition(position: Position) {
  const [x0, x1] = position.x;
  const [y0, y1] = position.y;
  
  const x = useMemo(
    () => (t: number) => x0 + (x1 - x0) * t,
    [x0, x1],
  );

  const y = useMemo(
    () => (t: number) => y0 + (y1 - y0) * t,
    [y0, y1],
  );

  return useMemo(() => ({ x, y }), [x, y]);
}

