import { describe, expect, it } from "vitest";

import {
  fittedRateDomain,
  hasSubDailySpacing,
  historyTooltipDate,
  percentAxis,
  rateTicks,
} from "../borrowChartData";

describe("fittedRateDomain", () => {
  it("pads a multi-point domain by 5% of its span", () => {
    const points = [
      { timeMs: 0, ratePercent: 3.0 },
      { timeMs: 1, ratePercent: 3.5 },
      { timeMs: 2, ratePercent: 4.0 },
    ];

    expect(fittedRateDomain(points)).toEqual([2.95, 4.05]);
  });

  it("pads a flat non-zero series to a visible band sized off the value", () => {
    const points = [
      { timeMs: 0, ratePercent: 5.0 },
      { timeMs: 1, ratePercent: 5.0 },
    ];

    expect(fittedRateDomain(points)).toEqual([4.75, 5.25]);
  });

  it("clamps the floor band at 0 for an exactly-zero flat series — a rate is never negative", () => {
    const points = [
      { timeMs: 0, ratePercent: 0 },
      { timeMs: 1, ratePercent: 0 },
    ];

    expect(fittedRateDomain(points)).toEqual([0, 0.1]);
  });

  it("clamps a low flat series' domain at 0 rather than padding below zero", () => {
    const points = [
      { timeMs: 0, ratePercent: 0.02 },
      { timeMs: 1, ratePercent: 0.02 },
    ];

    // Unclamped this would be [0.02 - 0.1, 0.02 + 0.1] = [-0.08, 0.12].
    const [lo, hi] = fittedRateDomain(points);
    expect(lo).toBe(0);
    expect(hi).toBeCloseTo(0.12, 10);
  });

  it("treats a single point as a flat series", () => {
    const points = [{ timeMs: 0, ratePercent: 2.0 }];

    expect(fittedRateDomain(points)).toEqual([1.9, 2.1]);
  });

  it("throws on an empty series rather than returning a fake domain", () => {
    expect(() => fittedRateDomain([])).toThrow();
  });
});

describe("rateTicks", () => {
  it("returns count evenly spaced ticks with formatted labels", () => {
    expect(rateTicks([3, 4], 3)).toEqual([
      { value: 3, label: "3%" },
      { value: 3.5, label: "3.5%" },
      { value: 4, label: "4%" },
    ]);
  });

  it("spans exactly the two domain endpoints when count is 2", () => {
    expect(rateTicks([1, 5], 2)).toEqual([
      { value: 1, label: "1%" },
      { value: 5, label: "5%" },
    ]);
  });

  it("returns a single tick at the domain minimum when count is 1", () => {
    expect(rateTicks([2, 8], 1)).toEqual([{ value: 2, label: "2%" }]);
  });

  it("produces distinct labels when chained from an all-zero-rate series' fitted domain", () => {
    // Regression: an idle reserve's rate is genuinely 0% for the whole
    // window. If fittedRateDomain let the lower bound dip below 0, the two
    // lowest ticks would both round through formatAprPercent's `percent <= 0`
    // branch to the same "0%" label — an indistinguishable gridline pair.
    const points = [
      { timeMs: 0, ratePercent: 0 },
      { timeMs: 1, ratePercent: 0 },
    ];

    const ticks = rateTicks(fittedRateDomain(points), 3);

    expect(ticks.map((t) => t.label)).toEqual(["0%", "0.05%", "0.1%"]);
    expect(new Set(ticks.map((t) => t.label)).size).toBe(ticks.length);
  });
});

describe("percentAxis", () => {
  it("produces 5 even whole-percent ticks and a matching domain for an evenly divisible max", () => {
    expect(percentAxis(24, 5)).toEqual({
      domain: [0, 24],
      ticks: [
        { value: 0, label: "0%" },
        { value: 6, label: "6%" },
        { value: 12, label: "12%" },
        { value: 18, label: "18%" },
        { value: 24, label: "24%" },
      ],
    });
  });

  it("rounds the ceiling up so the top tick never lands outside the domain", () => {
    // Independently-rounded steps would put the top tick (65) above a
    // [0, 64.5] domain — and the chart SVG is overflow: visible.
    const { domain, ticks } = percentAxis(64.5, 5);

    expect(domain).toEqual([0, 68]);
    expect(ticks.map((t) => t.value)).toEqual([0, 17, 34, 51, 68]);
  });

  it("keeps every tick distinct for a max smaller than the tick count", () => {
    // Whole-percent rounding of 5 steps across [0, 2] would emit duplicate
    // values — duplicate React keys and overlapping gridlines downstream.
    const { domain, ticks } = percentAxis(2, 5);

    expect(domain).toEqual([0, 4]);
    expect(ticks.map((t) => t.value)).toEqual([0, 1, 2, 3, 4]);
    expect(new Set(ticks.map((t) => t.value)).size).toBe(ticks.length);
  });

  it("returns a single zero tick when count is 1", () => {
    expect(percentAxis(24, 1)).toEqual({
      domain: [0, 24],
      ticks: [{ value: 0, label: "0%" }],
    });
  });
});

describe("hasSubDailySpacing", () => {
  const HOUR_MS = 60 * 60 * 1_000;

  it("is true when any adjacent samples sit less than a day apart", () => {
    const points = [
      { timeMs: 0, ratePercent: 3 },
      { timeMs: 24 * HOUR_MS, ratePercent: 3.2 },
      { timeMs: 25 * HOUR_MS, ratePercent: 3.4 },
    ];

    expect(hasSubDailySpacing(points)).toBe(true);
  });

  it("is false for daily-or-coarser buckets", () => {
    const points = [
      { timeMs: 0, ratePercent: 3 },
      { timeMs: 24 * HOUR_MS, ratePercent: 3.2 },
      { timeMs: 72 * HOUR_MS, ratePercent: 3.4 },
    ];

    expect(hasSubDailySpacing(points)).toBe(false);
  });

  it("is false for a single point — there is no adjacent pair to collide", () => {
    expect(hasSubDailySpacing([{ timeMs: 0, ratePercent: 3 }])).toBe(false);
  });
});

describe("historyTooltipDate", () => {
  it("renders date and time for sub-daily buckets", () => {
    const timeMs = new Date(2026, 6, 4, 14, 0).getTime();

    expect(historyTooltipDate(timeMs, true)).toBe("Jul 4, 14:00");
  });

  it("renders date and year (no time) for daily-or-coarser buckets", () => {
    const timeMs = new Date(2026, 6, 4, 14, 0).getTime();

    expect(historyTooltipDate(timeMs, false)).toBe("Jul 4, 2026");
  });

  it("pads single-digit hours and minutes", () => {
    const timeMs = new Date(2026, 0, 9, 4, 5).getTime();

    expect(historyTooltipDate(timeMs, true)).toBe("Jan 9, 04:05");
  });
});
