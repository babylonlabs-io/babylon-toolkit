import { describe, expect, it } from "vitest";

import { HEALTH_FACTOR_DISPLAY_CAP } from "../../constants";
import {
  formatHealthFactor,
  getHealthFactorColor,
} from "../healthFactorDisplay";

/** The largest double below a positive `value`. */
function nextDoubleBelow(value: number): number {
  const view = new DataView(new ArrayBuffer(8));
  view.setFloat64(0, value);
  view.setBigUint64(0, view.getBigUint64(0) - 1n);
  return view.getFloat64(0);
}

describe("formatHealthFactor", () => {
  it("returns '-' when there is no debt (null)", () => {
    expect(formatHealthFactor(null)).toBe("-");
  });

  it("formats a normal health factor to two decimals", () => {
    expect(formatHealthFactor(1.5)).toBe("1.50");
  });

  it("shows a liquidatable health factor below 1.00, never as 1.00", () => {
    expect(formatHealthFactor(0.995)).toBe("0.99");
    expect(formatHealthFactor(0.999)).toBe("0.99");
    expect(formatHealthFactor(nextDoubleBelow(1))).toBe("0.99");
  });

  it("shows a health factor exactly at the liquidation threshold as 1.00", () => {
    expect(formatHealthFactor(1)).toBe("1.00");
  });

  it("rounds down to the hundredth rather than to the nearest", () => {
    // 1.0496 sits just under the 1.05 borrow minimum.
    expect(formatHealthFactor(1.0496)).toBe("1.04");
    expect(formatHealthFactor(5 / 3)).toBe("1.66");
  });

  it("keeps a value that is already a hundredth instead of showing it a hundredth low", () => {
    // Each is stored just below its decimal (1.15 is 1.1499…), so flooring
    // `value * 100` would print 1.14, 0.28 and 2.00.
    expect(formatHealthFactor(1.15)).toBe("1.15");
    expect(formatHealthFactor(0.29)).toBe("0.29");
    expect(formatHealthFactor(2.01)).toBe("2.01");
  });

  it("rounds every value up to the display cap down to the hundredth at or below it", () => {
    // For each hundredth: the hundredth itself, the double just below it and
    // the midpoint below it (where rounding to nearest would go up).
    const mismatches: string[] = [];
    for (let k = 1; k <= HEALTH_FACTOR_DISPLAY_CAP * 100; k++) {
      const hundredth = k / 100;
      const hundredthBelow = ((k - 1) / 100).toFixed(2);
      const probes: Array<[number, string]> = [
        [hundredth, hundredth.toFixed(2)],
        [nextDoubleBelow(hundredth), hundredthBelow],
        [(k - 0.5) / 100, hundredthBelow],
      ];
      for (const [value, expected] of probes) {
        const actual = formatHealthFactor(value);
        if (actual !== expected) {
          mismatches.push(`${value} -> ${actual}, expected ${expected}`);
        }
      }
    }
    expect(mismatches).toEqual([]);
  });

  it("returns '-' for an absurdly high value instead of scientific notation", () => {
    // Regression: a sub-precision borrow produced HF ~1.7e+55, which
    // `toFixed(2)` renders as "1.700300179615284e+55".
    expect(formatHealthFactor(1.700300179615284e55)).toBe("-");
  });

  it("returns '-' for a non-finite value (Infinity)", () => {
    expect(formatHealthFactor(Infinity)).toBe("-");
  });

  it("returns '-' just above the display cap", () => {
    expect(formatHealthFactor(HEALTH_FACTOR_DISPLAY_CAP + 1)).toBe("-");
  });

  it("still formats a value at the cap", () => {
    expect(formatHealthFactor(HEALTH_FACTOR_DISPLAY_CAP)).toBe(
      `${HEALTH_FACTOR_DISPLAY_CAP}.00`,
    );
  });

  it("returns the raw number for high HF (delta callers depend on this)", () => {
    // formatHealthFactor must never substitute a label for high values —
    // callers that show deltas (e.g. action review) need the numeric string
    // to compute before/after diffs. The label substitution lives at the
    // call site, not here.
    expect(formatHealthFactor(50)).toBe("50.00");
    expect(formatHealthFactor(51)).toBe("51.00");
    expect(formatHealthFactor(100)).toBe("100.00");
  });
});

it("shows a risky position in red", () => {
  expect(getHealthFactorColor("risky")).toBe("#FF1744");
});

it("shows no debt in green", () => {
  expect(getHealthFactorColor("no_debt")).toBe("#15B768");
});

it("shows a safe position in green", () => {
  expect(getHealthFactorColor("safe")).toBe("#15B768");
});

it("shows a warning position in amber", () => {
  expect(getHealthFactorColor("warning")).toBe("#F7931A");
});

it("shows a liquidatable position in dark red", () => {
  expect(getHealthFactorColor("danger")).toBe("#C62828");
});
