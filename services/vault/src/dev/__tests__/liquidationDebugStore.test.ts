import { describe, expect, it } from "vitest";

import { resolveLiquidationCardState } from "../liquidationDebugStore";

const live = { hasCollateral: true, hasLoans: false };

describe("resolveLiquidationCardState", () => {
  it("passes the live position through untouched on auto", () => {
    expect(resolveLiquidationCardState("auto", live)).toBe(live);
  });

  it("forces each card state regardless of the live position", () => {
    expect(resolveLiquidationCardState("no-deposit", live)).toEqual({
      hasCollateral: false,
      hasLoans: false,
    });
    expect(resolveLiquidationCardState("no-loan", live)).toEqual({
      hasCollateral: true,
      hasLoans: false,
    });
    expect(
      resolveLiquidationCardState("position", {
        hasCollateral: false,
        hasLoans: false,
      }),
    ).toEqual({ hasCollateral: true, hasLoans: true });
  });
});
