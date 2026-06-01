import { describe, expect, it } from "vitest";

import { HEALTH_FACTOR_DISPLAY_CAP } from "../../constants";
import { formatHealthFactor } from "../healthFactorDisplay";

describe("formatHealthFactor", () => {
  it("returns '-' when there is no debt (null)", () => {
    expect(formatHealthFactor(null)).toBe("-");
  });

  it("formats a normal health factor to two decimals", () => {
    expect(formatHealthFactor(1.5)).toBe("1.50");
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
});
