// @vitest-environment node
import { describe, expect, it } from "vitest";

import { type BorrowReserve } from "../../borrowParams";
import { buildPrecisionProbe } from "../borrowPrecision";

const USDC: BorrowReserve = {
  symbol: "USDC",
  name: "USD Coin",
  reserveId: 3n,
  tokenAddress: "0xb588c1bd8a6cd3f114a52a0ad916778b419ecf48",
  hub: "0xcf2e44443f8954bdd0881753293e952638f8e15e",
  decimals: 6,
};

describe("buildPrecisionProbe", () => {
  it("rejects an amount that is not a plain decimal number", () => {
    expect(() => buildPrecisionProbe("1e-3", USDC)).toThrow(
      "is not a plain decimal number",
    );
  });

  it("rejects an amount with more fraction digits than the token's precision", () => {
    expect(() => buildPrecisionProbe("1.1234567", USDC)).toThrow(
      "already has 7 fraction digits",
    );
  });
});
