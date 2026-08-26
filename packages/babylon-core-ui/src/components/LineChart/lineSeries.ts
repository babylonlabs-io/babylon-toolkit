/**
 * Series math for the line chart: domain fitting, the path shape, and the two
 * hover lookups. `buildLinePath` and `valueAtX` must agree on what `"step"`
 * means, so both live here rather than splitting the shape between a curve
 * factory and the hover code.
 */

import type { LineChartDomain, LineChartPoint, LineInterpolation } from "./types";

/** Half-span used when every value is identical; keeps the scale non-degenerate. */
const FLAT_DOMAIN_FALLBACK = 1;

/**
 * `[min, max]` over `values`, widened by `padFraction` of the span at each end.
 * Deliberately not zero-based: a series that never approaches zero should fill
 * the plot. A flat or single-value series gets a symmetric span around it.
 */
export function fitDomain(values: number[], padFraction = 0): LineChartDomain {
  const finite = values.filter(Number.isFinite);
  if (finite.length === 0) return [0, FLAT_DOMAIN_FALLBACK];
  const min = Math.min(...finite);
  const max = Math.max(...finite);
  if (min === max) {
    const half = Math.max(Math.abs(min) * padFraction, FLAT_DOMAIN_FALLBACK);
    return [min - half, max + half];
  }
  const pad = (max - min) * padFraction;
  return [min - pad, max + pad];
}

/** Points sorted ascending by x, with non-finite entries dropped. */
export function normalizeSeries(data: LineChartPoint[]): LineChartPoint[] {
  return data.filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y)).sort((a, b) => a.x - b.x);
}

/** SVG path data through already-projected pixel points. */
export function buildLinePath(points: LineChartPoint[], interpolation: LineInterpolation): string {
  if (points.length === 0) return "";
  const [first, ...rest] = points;
  const segments = rest.map((p) => (interpolation === "step" ? `H${p.x}V${p.y}` : `L${p.x} ${p.y}`));
  return `M${first.x} ${first.y}${segments.join("")}`;
}

/**
 * Index of the datum nearest `x`. Binary search on a sorted series; ties go to
 * the earlier point so the result is stable as the pointer crosses a midpoint.
 */
export function nearestIndex(points: LineChartPoint[], x: number): number {
  if (points.length === 0) return -1;
  let lo = 0;
  let hi = points.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (points[mid].x < x) lo = mid + 1;
    else hi = mid;
  }
  const after = lo;
  const before = Math.max(0, lo - 1);
  return x - points[before].x <= points[after].x - x ? before : after;
}

/**
 * Series value at `x`. Linear interpolates between the bracketing points; step
 * holds the earlier point's value until the next one. Outside the series the
 * nearest end value is held rather than extrapolated.
 */
export function valueAtX(points: LineChartPoint[], x: number, interpolation: LineInterpolation): number | null {
  if (points.length === 0) return null;
  if (x <= points[0].x) return points[0].y;
  const last = points[points.length - 1];
  if (x >= last.x) return last.y;

  let lo = 0;
  let hi = points.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (points[mid].x <= x) lo = mid;
    else hi = mid;
  }
  const before = points[lo];
  const after = points[hi];
  if (interpolation === "step") return before.y;
  const span = after.x - before.x;
  if (span === 0) return before.y;
  return before.y + ((x - before.x) / span) * (after.y - before.y);
}
