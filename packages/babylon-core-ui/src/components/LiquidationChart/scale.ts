import type { PriceAxisTick } from "./types";

/**
 * Segmented price → vertical fraction [0,1] (0 = top, 1 = bottom).
 *
 * Ticks are placed at even fractions regardless of price gap, so each segment
 * gets equal visual weight; a price interpolates linearly within its segment
 * and clamps to the ends outside the tick range. Ticks must be ordered
 * top→bottom (descending value).
 */
export function segmentedFraction(ticks: PriceAxisTick[], price: number): number {
  if (ticks.length < 2) return 0;
  const last = ticks.length - 1;
  if (price >= ticks[0].value) return 0;
  if (price <= ticks[last].value) return 1;
  for (let i = 0; i < last; i++) {
    const hi = ticks[i].value;
    const lo = ticks[i + 1].value;
    if (price <= hi && price >= lo) {
      const span = hi - lo;
      const t = span === 0 ? 0 : (hi - price) / span;
      return (i + t) / last;
    }
  }
  return 1;
}

/** Even fraction [0,1] for tick `i` of `n` ticks (matches {@link segmentedFraction}). */
export function tickFraction(index: number, count: number): number {
  return count < 2 ? 0 : index / (count - 1);
}

/** Linear price → vertical fraction [0,1] over [max,min] (0 = top = max). */
export function linearFraction(max: number, min: number, price: number): number {
  if (max === min) return 0;
  const f = (max - price) / (max - min);
  return f < 0 ? 0 : f > 1 ? 1 : f;
}

/** Percentage string helper for inline style props. */
export function pct(fraction: number): string {
  return `${fraction * 100}%`;
}
