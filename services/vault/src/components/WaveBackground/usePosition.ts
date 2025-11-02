import { useCallback, useMemo } from "react";
import type { Position } from "./types";

export type { Position };

export function usePosition(position: Position) {
  const x = useCallback(
    (t: number) => {
      const [x0, x1] = position.x;
      return x0 + (x1 - x0) * t;
    },
    [position.x],
  );

  const y = useCallback(
    (t: number) => {
      const [y0, y1] = position.y;
      return y0 + (y1 - y0) * t;
    },
    [position.y],
  );

  return useMemo(() => ({ x, y }), [x, y]);
}

