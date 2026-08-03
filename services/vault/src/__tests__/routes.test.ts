/**
 * Reserve-detail route building and `?reserve=` parsing.
 *
 * The reserve detail is addressed by the reserve's on-chain id, never by its
 * token symbol: the symbol comes from the indexer, so a symbol-keyed link lets
 * a compromised indexer decide which reserve opens (audit F7).
 */

import { describe, expect, it } from "vitest";

import {
  getMarketDataRoute,
  getReserveDetailRoute,
  parseReserveId,
} from "../routes";

/** Mainnet USDC — present in the address-keyed token registry. */
const REGISTERED_USDC = "0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85";

describe("getReserveDetailRoute", () => {
  it("writes the reserve id into the v2 route", () => {
    expect(getReserveDetailRoute(5n, "borrow", false)).toBe(
      "/?reserve=5&tab=borrow",
    );
  });

  it("writes the reserve id into the v3 route", () => {
    expect(getReserveDetailRoute(5n, "repay", true)).toBe(
      "/loans?reserve=5&tab=repay",
    );
  });

  it("preserves a large reserve id exactly", () => {
    expect(getReserveDetailRoute(18446744073709551617n, "borrow", true)).toBe(
      "/loans?reserve=18446744073709551617&tab=borrow",
    );
  });
});

describe("getMarketDataRoute", () => {
  it("names a registered token by its symbol", () => {
    expect(getMarketDataRoute(0n, REGISTERED_USDC)).toBe("/markets/usdc");
  });

  it("falls back to the reserve id for an unregistered token", () => {
    expect(
      getMarketDataRoute(7n, "0x1111111111111111111111111111111111111111"),
    ).toBe("/markets/7");
  });

  it("falls back to the reserve id when the underlying is unknown", () => {
    expect(getMarketDataRoute(7n)).toBe("/markets/7");
  });
});

describe("parseReserveId", () => {
  it("parses a plain decimal id", () => {
    expect(parseReserveId("5")).toBe(5n);
  });

  it("parses zero", () => {
    expect(parseReserveId("0")).toBe(0n);
  });

  it("rejects a legacy symbol param", () => {
    expect(parseReserveId("usdc")).toBeNull();
  });

  it.each(["0x5", " 5 ", "-1", "5.0", "5e3", "", "abc"])(
    "rejects %j rather than coercing it",
    (param) => {
      expect(parseReserveId(param)).toBeNull();
    },
  );

  it("returns null for a missing param", () => {
    expect(parseReserveId(null)).toBeNull();
    expect(parseReserveId(undefined)).toBeNull();
  });
});
