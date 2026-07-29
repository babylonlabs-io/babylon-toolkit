import { describe, expect, it } from "vitest";
import { createLinearPriceScale, createSegmentedPriceScale } from "../priceScale";
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
