import { describe, expect, it } from "vitest";
import { buildLinePath, fitDomain, nearestIndex, normalizeSeries, valueAtX } from "../lineSeries";

const series = [
  { x: 0, y: 10 },
  { x: 10, y: 20 },
  { x: 20, y: 40 },
];

describe("fitDomain", () => {
  it("fits the data rather than anchoring at zero", () => {
    expect(fitDomain([120, 140, 160])).toEqual([120, 160]);
  });

  it("widens both ends by the padding fraction of the span", () => {
    expect(fitDomain([100, 200], 0.05)).toEqual([95, 205]);
  });

  it("gives a flat series a span so the scale is not degenerate", () => {
    const [min, max] = fitDomain([7, 7, 7], 0.05);
    expect(max).toBeGreaterThan(min);
    expect(min).toBeLessThan(7);
    expect(max).toBeGreaterThan(7);
  });

  it("ignores non-finite values", () => {
    expect(fitDomain([Number.NaN, 5, Number.POSITIVE_INFINITY, 9])).toEqual([5, 9]);
  });
});

describe("normalizeSeries", () => {
  it("sorts by x and drops non-finite points", () => {
    expect(
      normalizeSeries([
        { x: 5, y: 1 },
        { x: Number.NaN, y: 2 },
        { x: 1, y: 3 },
        { x: 3, y: Number.POSITIVE_INFINITY },
      ]),
    ).toEqual([
      { x: 1, y: 3 },
      { x: 5, y: 1 },
    ]);
  });
});

describe("buildLinePath", () => {
  it("joins points directly when linear", () => {
    expect(buildLinePath(series, "linear")).toBe("M0 10L10 20L20 40");
  });

  it("holds each value until the next x when stepped", () => {
    expect(buildLinePath(series, "step")).toBe("M0 10H10V20H20V40");
  });

  it("returns nothing for an empty series", () => {
    expect(buildLinePath([], "linear")).toBe("");
  });
});

describe("nearestIndex", () => {
  it("finds the closest datum on either side", () => {
    expect(nearestIndex(series, 1)).toBe(0);
    expect(nearestIndex(series, 9)).toBe(1);
    expect(nearestIndex(series, 16)).toBe(2);
  });

  it("resolves an exact midpoint to the earlier point", () => {
    expect(nearestIndex(series, 5)).toBe(0);
  });

  it("clamps beyond either end of the series", () => {
    expect(nearestIndex(series, -100)).toBe(0);
    expect(nearestIndex(series, 100)).toBe(2);
  });
});

describe("valueAtX", () => {
  it("interpolates between the bracketing points", () => {
    expect(valueAtX(series, 5, "linear")).toBe(15);
    expect(valueAtX(series, 15, "linear")).toBe(30);
  });

  it("holds the earlier value across a step segment", () => {
    expect(valueAtX(series, 5, "step")).toBe(10);
    expect(valueAtX(series, 9.99, "step")).toBe(10);
    expect(valueAtX(series, 10, "step")).toBe(20);
  });

  it("holds the end values instead of extrapolating", () => {
    expect(valueAtX(series, -50, "linear")).toBe(10);
    expect(valueAtX(series, 500, "linear")).toBe(40);
  });

  it("returns null for an empty series", () => {
    expect(valueAtX([], 1, "linear")).toBeNull();
  });

  it("survives duplicate x values without dividing by zero", () => {
    const duplicated = [
      { x: 0, y: 1 },
      { x: 5, y: 2 },
      { x: 5, y: 8 },
      { x: 10, y: 9 },
    ];
    expect(Number.isFinite(valueAtX(duplicated, 5, "linear") ?? Number.NaN)).toBe(true);
  });
});
