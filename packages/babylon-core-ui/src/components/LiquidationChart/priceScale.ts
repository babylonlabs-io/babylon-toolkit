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

/** Linear price → pixel offset from the plot top over [max, min] (Timeline).
 * Non-finite or reversed bounds degrade to the flat degenerate scale rather
 * than silently inverting the axis or rendering NaN coordinates. */
export function createLinearPriceScale(priceMax: number, priceMin: number, plotHeight: number): PriceScale {
  if (!Number.isFinite(priceMax) || !Number.isFinite(priceMin) || priceMax <= priceMin) {
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
 * The safe zone (and its candles) never drops below this share of the plot,
 * however many events are cascading. The Figma frame only shows 3 events at
 * a fixed ~44px row each (~60% left for the safe zone); it's silent on what
 * happens with a full 10-vault cascade, so this is a judgment call, not a
 * spec value — flag with design if it needs to move.
 */
const MIN_SAFE_ZONE_FRACTION = 0.3;

/**
 * Timeline region fractions: the first span is the safe zone (where the
 * candles live), the rest are liquidation events. The design gives every
 * event a fixed, compact row — never scaled by its real price span, which
 * would make a $180 event an unreadable sliver next to a $37k one — pinned
 * at `minFraction`. The safe zone gets whatever height remains, down to
 * {@link MIN_SAFE_ZONE_FRACTION}: past that (a long cascade — the protocol
 * allows up to 10 vaults), every event's row compresses evenly below the
 * floor instead of being clipped individually or crushing the safe zone to
 * nothing. A compressed row's in-band text degrades on its own via
 * BandLayer's existing height-based dropout. Returns one fraction per span,
 * summing to 1.
 */
export function timelineRegionFractions(spans: number[], minFraction: number): number[] {
  if (spans.length === 0) return [];
  if (spans.length === 1) return [1];
  const eventCount = spans.length - 1;
  const eventsBudget = eventCount * minFraction;
  const maxEventsBudget = 1 - MIN_SAFE_ZONE_FRACTION;
  if (eventsBudget <= maxEventsBudget) {
    return [1 - eventsBudget, ...new Array(eventCount).fill(minFraction)];
  }
  const compressedFrac = maxEventsBudget / eventCount;
  return [1 - maxEventsBudget, ...new Array(eventCount).fill(compressedFrac)];
}

/**
 * Anchored price → pixel offset from the plot top (Timeline).
 *
 * A polylinear scale through explicit (price, fraction) stops — the Timeline
 * derives them from {@link timelineRegionFractions}'s fixed-row regions, so
 * the Y scale is deliberately non-uniform. Prices interpolate linearly
 * between anchors and clamp outside them.
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
