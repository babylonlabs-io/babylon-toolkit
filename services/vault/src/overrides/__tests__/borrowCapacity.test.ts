import { describe, expect, it } from "vitest";

import { resolveShownHealthFactor } from "../borrowCapacity";

describe("resolveShownHealthFactor", () => {
  it("passes the live health factor and status through when there is no override", () => {
    expect(resolveShownHealthFactor(null, 2.4, "safe")).toEqual({
      healthFactor: 2.4,
      healthFactorStatus: "safe",
    });
  });

  it("substitutes the forced value and re-derives its status from production banding", () => {
    // Live status is "safe", but the forced value bands as "danger" — the
    // status must follow the forced value, never the live read.
    expect(resolveShownHealthFactor(0.5, 2.4, "safe")).toEqual({
      healthFactor: 0.5,
      healthFactorStatus: "danger",
    });
  });

  it("re-derives warning and safe bands for their respective forced values", () => {
    expect(resolveShownHealthFactor(1.25, null, "no_debt")).toEqual({
      healthFactor: 1.25,
      healthFactorStatus: "warning",
    });
    expect(resolveShownHealthFactor(2.5, null, "no_debt")).toEqual({
      healthFactor: 2.5,
      healthFactorStatus: "safe",
    });
  });
});
