import { describe, expect, it } from "vitest";
import { createLinearPriceScale, createSegmentedPriceScale, timelineRegionFractions } from "../priceScale";
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

  it("degrades reversed or non-finite bounds to a flat scale instead of inverting", () => {
    expect(createLinearPriceScale(40000, 90000, PLOT_HEIGHT)(65000)).toBe(0);
    expect(createLinearPriceScale(Number.NaN, 40000, PLOT_HEIGHT)(65000)).toBe(0);
    expect(createLinearPriceScale(90000, Number.NEGATIVE_INFINITY, PLOT_HEIGHT)(65000)).toBe(0);
  });
});

describe("timelineRegionFractions", () => {
  it("gives every event its floor fraction regardless of price span", () => {
    // Event 1 spans $37k, event 2 only $283 — the design draws both as the
    // same compact row, so neither price span should move its fraction.
    const fractions = timelineRegionFractions([12_318, 37_399, 283], 0.1347);
    expect(fractions[1]).toBeCloseTo(0.1347, 9);
    expect(fractions[2]).toBeCloseTo(0.1347, 9);
    expect(fractions.reduce((sum, f) => sum + f, 0)).toBeCloseTo(1, 9);
  });

  it("gives the safe zone whatever height the floored events leave behind", () => {
    const fractions = timelineRegionFractions([12_318, 37_399, 283], 0.1347);
    expect(fractions[0]).toBeCloseTo(1 - 2 * 0.1347, 9);
  });

  it("keeps the safe zone at its 30% floor and compresses events evenly past it", () => {
    // 4 events at the 0.2 floor each would claim 80% of the plot; the safe
    // zone's 30% guarantee wins, so all 4 events shrink evenly to share the
    // remaining 70% instead.
    const fractions = timelineRegionFractions([1_000, 1_000, 1_000, 1_000, 1_000], 0.2);
    expect(fractions[0]).toBeCloseTo(0.3, 9);
    for (let i = 1; i < fractions.length; i++) {
      expect(fractions[i]).toBeCloseTo(0.7 / 4, 9);
    }
    expect(fractions.reduce((sum, f) => sum + f, 0)).toBeCloseTo(1, 9);
  });

  it("keeps the safe zone at its 30% floor for a full 10-vault cascade", () => {
    // The protocol allows up to 10 vaults per position — 10 events at the
    // 44px-derived floor would blow past 100% of the plot on their own, so
    // every event compresses evenly and the safe zone never gets crushed.
    const spans = new Array(11).fill(10_000); // safe zone + 10 events
    const fractions = timelineRegionFractions(spans, 0.1347);
    expect(fractions[0]).toBeCloseTo(0.3, 9);
    for (let i = 1; i < fractions.length; i++) {
      expect(fractions[i]).toBeCloseTo(0.7 / 10, 9);
      expect(fractions[i]).toBeLessThan(0.1347); // compressed below the nominal floor
    }
    expect(fractions.reduce((sum, f) => sum + f, 0)).toBeCloseTo(1, 9);
  });

  it("compresses to the 30% safe-zone-floor budget, not an incidental spans.length cap", () => {
    // 2 events at the 44px-derived floor (0.44 over a 100px plot) need 88px,
    // leaving only 12px for the safe zone — well under its 30% floor, so
    // compression must engage. A prior `Math.min(minFraction, 1 /
    // spans.length)` cap silently substituted 1/3 for 0.44 before this check,
    // producing an unrelated 33.3px row instead of the correct 35px one.
    const fractions = timelineRegionFractions([1, 1, 1], 44 / 100);
    expect(fractions[0]).toBeCloseTo(0.3, 9);
    expect(fractions[1]).toBeCloseTo(0.35, 9);
    expect(fractions[2]).toBeCloseTo(0.35, 9);
  });

  it("returns the single span whole", () => {
    expect(timelineRegionFractions([50_000], 0.1)).toEqual([1]);
  });

  it("returns nothing for no spans", () => {
    expect(timelineRegionFractions([], 0.1)).toEqual([]);
  });
});
