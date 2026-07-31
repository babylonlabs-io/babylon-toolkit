import { describe, expect, it } from "vitest";
import {
  compressedSpanFractions,
  createLinearPriceScale,
  createSegmentedPriceScale,
  timelineRegionFractions,
} from "../priceScale";
import type { PriceAxisTick } from "../types";

const PLOT_HEIGHT = 320;

const segmentedTicks: PriceAxisTick[] = [
  { value: 88400, label: "$88,400" },
  { value: 77682, label: "$77,682" },
  { value: 40283, label: "$40,283" },
  { value: 3597, label: "$3,597" },
  { value: 3417, label: "$3,417" },
];

describe("createSegmentedPriceScale", () => {
  it("places every tick at an even pixel offset regardless of its price gap", () => {
    const scale = createSegmentedPriceScale(segmentedTicks, PLOT_HEIGHT);
    // 4 segments over 320px = 80px each; the $37k gap and the $180 gap get
    // the same visual weight.
    expect(scale(88400)).toBe(0);
    expect(scale(77682)).toBe(80);
    expect(scale(40283)).toBe(160);
    expect(scale(3597)).toBe(240);
    expect(scale(3417)).toBe(320);
  });

  it("interpolates linearly inside a segment", () => {
    const scale = createSegmentedPriceScale(segmentedTicks, PLOT_HEIGHT);
    // Halfway through the $77,682 -> $40,283 segment.
    expect(scale((77682 + 40283) / 2)).toBeCloseTo(120, 9);
  });

  it("clamps prices outside the tick range to the plot edges", () => {
    const scale = createSegmentedPriceScale(segmentedTicks, PLOT_HEIGHT);
    expect(scale(1_000_000)).toBe(0);
    expect(scale(0)).toBe(PLOT_HEIGHT);
  });

  it("throws an actionable error when ticks are not strictly descending", () => {
    const duplicated: PriceAxisTick[] = [
      { value: 88400, label: "$88,400" },
      { value: 40283, label: "$40,283" },
      { value: 40283, label: "$40,283" },
    ];
    expect(() => createSegmentedPriceScale(duplicated, PLOT_HEIGHT)).toThrow(/strictly descending/);
    expect(() =>
      createSegmentedPriceScale(
        [
          { value: 40283, label: "$40,283" },
          { value: 88400, label: "$88,400" },
        ],
        PLOT_HEIGHT,
      ),
    ).toThrow(/strictly descending/);
  });

  it("maps every price to the top for a degenerate single-tick axis", () => {
    const scale = createSegmentedPriceScale([{ value: 50000, label: "$50,000" }], PLOT_HEIGHT);
    expect(scale(50000)).toBe(0);
    expect(scale(10)).toBe(0);
  });
});

describe("createLinearPriceScale", () => {
  it("maps the price domain linearly onto the plot height, top = max", () => {
    const scale = createLinearPriceScale(90000, 40000, PLOT_HEIGHT);
    expect(scale(90000)).toBe(0);
    expect(scale(40000)).toBe(PLOT_HEIGHT);
    expect(scale(65000)).toBeCloseTo(PLOT_HEIGHT / 2, 9);
  });

  it("clamps prices outside the domain", () => {
    const scale = createLinearPriceScale(90000, 40000, PLOT_HEIGHT);
    expect(scale(99000)).toBe(0);
    expect(scale(1000)).toBe(PLOT_HEIGHT);
  });

  it("maps every price to the top when max equals min", () => {
    const scale = createLinearPriceScale(50000, 50000, PLOT_HEIGHT);
    expect(scale(50000)).toBe(0);
    expect(scale(99999)).toBe(0);
  });
});

describe("compressedSpanFractions", () => {
  it("weights regions by square-rooted span and sums to 1", () => {
    const fractions = compressedSpanFractions([10_000, 40_000], 0.08);
    expect(fractions[0]).toBeCloseTo(1 / 3, 9);
    expect(fractions[1]).toBeCloseTo(2 / 3, 9);
    expect(fractions[0] + fractions[1]).toBeCloseTo(1, 9);
  });

  it("floors a tiny region at the given minimum and renormalises the rest", () => {
    const fractions = compressedSpanFractions([12_318, 37_399, 283], 0.08);
    expect(fractions[2]).toBeCloseTo(0.08, 9);
    expect(fractions.reduce((sum, f) => sum + f, 0)).toBeCloseTo(1, 9);
    expect(fractions[1]).toBeGreaterThan(fractions[0]);
  });

  it("splits evenly when every span is zero", () => {
    const fractions = compressedSpanFractions([0, 0], 0.08);
    expect(fractions.reduce((sum, f) => sum + f, 0)).toBeCloseTo(1, 9);
  });

  it("returns nothing for no spans", () => {
    expect(compressedSpanFractions([], 0.08)).toEqual([]);
  });
});

describe("timelineRegionFractions", () => {
  it("raises the safe zone to match the largest event", () => {
    // Safe span far smaller than event 1: without the guarantee the candles
    // would get ~32% of the plot; with it, safe equals the largest event.
    const fractions = timelineRegionFractions([12_318, 37_399, 283], 0.1347);
    expect(fractions[0]).toBeCloseTo(fractions[1], 9);
    expect(fractions[0]).toBeGreaterThan(0.4);
    expect(fractions[2]).toBeCloseTo(0.1347, 9);
    expect(fractions.reduce((sum, f) => sum + f, 0)).toBeCloseTo(1, 3);
  });

  it("leaves an already-dominant safe zone alone", () => {
    const fractions = timelineRegionFractions([80_000, 10_000, 10_000], 0.08);
    const weighted = compressedSpanFractions([80_000, 10_000, 10_000], 0.08);
    expect(fractions).toEqual(weighted);
  });

  it("keeps floored events at their minimum while equalising", () => {
    const fractions = timelineRegionFractions([5_000, 40_000, 100, 90], 0.1);
    expect(fractions[2]).toBeCloseTo(0.1, 9);
    expect(fractions[3]).toBeCloseTo(0.1, 9);
    expect(fractions[0]).toBeCloseTo(fractions[1], 9);
  });
});
