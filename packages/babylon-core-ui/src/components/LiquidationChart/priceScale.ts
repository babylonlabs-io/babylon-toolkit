import { scaleLinear } from "@visx/scale";
import type { PriceAxisTick } from "./types";

/** price → pixel offset from the plot top. */
export type PriceScale = ReturnType<typeof scaleLinear<number>>;

/** Domain/range used when the axis is degenerate; every price maps to 0. */
const DEGENERATE_DOMAIN: [number, number] = [1, 0];
const DEGENERATE_RANGE: [number, number] = [0, 0];

/**
 * Segmented price → pixel offset from the plot top (Seizure Map).
 *
 * A polylinear scale: ticks are placed at even pixel offsets regardless of
 * price gap, so each segment gets equal visual weight; a price interpolates
 * linearly within its segment and clamps to the ends outside the tick range.
 * Ticks must be ordered top→bottom (strictly descending value).
 *
 * `nice`/`round` must stay off: `nice` would move the outer stops away from
 * the caller's tick values, `round` would shift marks by up to half a pixel.
 */
export function createSegmentedPriceScale(ticks: PriceAxisTick[], plotHeight: number): PriceScale {
  const last = ticks.length - 1;
  if (last < 1) {
    return scaleLinear<number>({ domain: DEGENERATE_DOMAIN, range: DEGENERATE_RANGE, clamp: true });
  }
  const domain = ticks.map((t) => t.value);
  assertStrictlyDescending(domain);
  const range = domain.map((_, i) => (i / last) * plotHeight);
  return scaleLinear<number>({ domain, range, clamp: true });
}

/** Linear price → pixel offset from the plot top over [max, min] (Timeline). */
export function createLinearPriceScale(priceMax: number, priceMin: number, plotHeight: number): PriceScale {
  if (priceMax === priceMin) {
    return scaleLinear<number>({ domain: DEGENERATE_DOMAIN, range: DEGENERATE_RANGE, clamp: true });
  }
  return scaleLinear<number>({ domain: [priceMax, priceMin], range: [0, plotHeight], clamp: true });
}

/** A duplicate or misordered tick would silently shift every band by up to
 * half a segment, so a broken axis is an error, not a best-effort render. */
function assertStrictlyDescending(domain: number[]): void {
  for (let i = 1; i < domain.length; i++) {
    if (!(domain[i] < domain[i - 1])) {
      throw new Error(
        `LiquidationChart: priceAxis must be strictly descending (top→bottom). ` +
          `Got ${domain[i - 1]} at index ${i - 1} followed by ${domain[i]} at index ${i}. ` +
          `Deduplicate and sort ticks in the caller before passing priceAxis.`,
      );
    }
  }
}
