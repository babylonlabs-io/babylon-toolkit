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

/** A price pinned to an explicit vertical fraction of the plot. */
export interface PriceAnchor {
  price: number;
  /** [0,1] from the plot top; must ascend as prices descend. */
  fraction: number;
}

/**
 * Exponent applied to a price span before it becomes a vertical fraction.
 * 1 is true proportions (a $180 event next to a $37k one is an unreadable
 * sliver); 0 is all regions equal. The square root keeps the ordering and a
 * visible size difference — the vertical twin of the share-width compression.
 */
const SPAN_WEIGHT_EXPONENT = 0.5;
/**
 * Vertical fractions for consecutive price spans, compressed by
 * {@link SPAN_WEIGHT_EXPONENT} and floored at `minFraction` (renormalising
 * the rest), so the split tracks the real values without starving small
 * regions. The caller derives `minFraction` from a pixel minimum so floored
 * regions keep their text at any chart width. Returns one fraction per span,
 * summing to 1.
 */
export function compressedSpanFractions(spans: number[], minFraction: number): number[] {
  if (spans.length === 0) return [];
  const minFrac = Math.min(minFraction, 1 / spans.length);
  const weights = spans.map((span) => Math.pow(Math.max(0, span), SPAN_WEIGHT_EXPONENT));
  const total = weights.reduce((sum, w) => sum + w, 0);
  const raw = weights.map((w) => (total > 0 ? w / total : 1 / spans.length));
  const floored = raw.map((f) => f < minFrac);
  const flooredBudget = floored.filter(Boolean).length * minFrac;
  const restRaw = raw.reduce((sum, f, i) => sum + (floored[i] ? 0 : f), 0);
  const restScale = restRaw > 0 ? (1 - flooredBudget) / restRaw : 0;
  return raw.map((f, i) => (floored[i] ? minFrac : f * restScale));
}

/** Tolerance for fraction comparisons (floors, fixed-point equalisation). */
const FRACTION_EPSILON = 1e-9;

/**
 * Timeline region fractions: the first span is the safe zone (where the
 * candles live), the rest are liquidation events. On top of the compressed
 * weighting, the safe zone is guaranteed at least the size of the LARGEST
 * event — otherwise the candle chart squeezes unreadably — by scaling the
 * non-floored events down while floored ones keep their minimum.
 */
export function timelineRegionFractions(spans: number[], minFraction: number): number[] {
  const fractions = compressedSpanFractions(spans, minFraction);
  if (fractions.length <= 1) return fractions;
  const minFrac = Math.min(minFraction, 1 / spans.length);

  // Fixed-point: each pass either satisfies the guarantee or floors another
  // event, so it terminates within one pass per event.
  for (let guard = 0; guard < spans.length; guard++) {
    const events = fractions.slice(1);
    if (fractions[0] >= Math.max(...events) - FRACTION_EPSILON) break;
    const fixedSum = events.reduce((sum, f) => sum + (f <= minFrac + FRACTION_EPSILON ? f : 0), 0);
    const scalable = events.filter((f) => f > minFrac + FRACTION_EPSILON);
    if (!scalable.length) {
      fractions[0] = 1 - fixedSum;
      break;
    }
    const scalableSum = scalable.reduce((sum, f) => sum + f, 0);
    const maxScalable = Math.max(...scalable);
    const scale = (1 - fixedSum) / (maxScalable + scalableSum);
    fractions[0] = maxScalable * scale;
    for (let i = 1; i < fractions.length; i++) {
      if (fractions[i] > minFrac + FRACTION_EPSILON) {
        fractions[i] = Math.max(fractions[i] * scale, minFrac);
      }
    }
  }
  return fractions;
}

/**
 * Anchored price → pixel offset from the plot top (Timeline).
 *
 * A polylinear scale through explicit (price, fraction) stops — the Timeline
 * derives them from span-weighted regions, so the Y scale is deliberately
 * non-uniform. Prices interpolate linearly between anchors and clamp outside
 * them.
 */
export function createAnchoredPriceScale(anchors: PriceAnchor[], plotHeight: number): PriceScale {
  if (anchors.length < 2) {
    return scaleLinear<number>({ domain: DEGENERATE_DOMAIN, range: DEGENERATE_RANGE, clamp: true });
  }
  const domain = anchors.map((a) => a.price);
  assertStrictlyDescending(domain);
  const fractions = anchors.map((a) => a.fraction);
  for (let i = 1; i < fractions.length; i++) {
    if (!(fractions[i] > fractions[i - 1])) {
      throw new Error(
        `LiquidationChart: anchor fractions must be strictly ascending (top→bottom). ` +
          `Got ${fractions[i - 1]} at index ${i - 1} followed by ${fractions[i]} at index ${i}.`,
      );
    }
  }
  const range = fractions.map((f) => f * plotHeight);
  return scaleLinear<number>({ domain, range, clamp: true });
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
