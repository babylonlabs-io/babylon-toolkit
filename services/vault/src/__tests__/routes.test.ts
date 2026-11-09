/**
 * Reserve-detail route building and `?reserve=` parsing.
 *
 * The reserve detail is addressed by the reserve's on-chain id, never by its
 * token symbol: the symbol comes from the indexer, so a symbol-keyed link lets
 * a compromised indexer decide which reserve opens (audit F7).
 */

import { describe, expect, it } from "vitest";

import { USDC } from "@/test/deploymentAddresses";

import {
  getHubPickerSearch,
  getMarketDataRoute,
  getReserveDetailSearch,
  opensLoanFlow,
  parseAssetParam,
  parseReserveId,
} from "../routes";

describe("getReserveDetailSearch", () => {
  it("writes the reserve id into the search", () => {
    expect(getReserveDetailSearch(5n, "repay")).toBe("?reserve=5&tab=repay");
  });

  it("preserves a large reserve id exactly", () => {
    expect(getReserveDetailSearch(18446744073709551617n, "borrow")).toBe(
      "?reserve=18446744073709551617&tab=borrow",
    );
  });

  it("carries the chosen asset onto the form search", () => {
    expect(getReserveDetailSearch(4n, "borrow", USDC)).toBe(
      `?reserve=4&tab=borrow&asset=${USDC}`,
    );
  });

  it("omits the asset when the form wasn't reached through the pickers", () => {
    expect(getReserveDetailSearch(4n, "borrow")).toBe("?reserve=4&tab=borrow");
  });
});

describe("getHubPickerSearch", () => {
  it("opens the borrow picker narrowed to one token", () => {
    expect(getHubPickerSearch(USDC)).toBe(`?picker=borrow&asset=${USDC}`);
  });
});

describe("opensLoanFlow", () => {
  it("opens the loan flow at the borrow picker", () => {
    expect(opensLoanFlow(new URLSearchParams("?picker=borrow"))).toBe(true);
  });

  it("opens the loan flow at the repay picker", () => {
    expect(opensLoanFlow(new URLSearchParams("?picker=repay"))).toBe(true);
  });

  it("opens the loan flow at a reserve form", () => {
    expect(opensLoanFlow(new URLSearchParams("?reserve=5&tab=repay"))).toBe(
      true,
    );
  });

  it("keeps the loan flow closed for an unknown picker", () => {
    expect(opensLoanFlow(new URLSearchParams("?picker=foo"))).toBe(false);
  });

  it("keeps the loan flow closed for an empty reserve", () => {
    expect(opensLoanFlow(new URLSearchParams("?reserve="))).toBe(false);
  });

  it("keeps the loan flow closed without a picker or a reserve", () => {
    expect(opensLoanFlow(new URLSearchParams(""))).toBe(false);
  });
});

describe("parseAssetParam", () => {
  it("checksums a lowercase address", () => {
    expect(parseAssetParam(USDC.toLowerCase())).toBe(USDC);
  });

  it("rejects a token symbol", () => {
    expect(parseAssetParam("usdc")).toBeNull();
  });

  it("returns null for a missing param", () => {
    expect(parseAssetParam(null)).toBeNull();
    expect(parseAssetParam(undefined)).toBeNull();
  });
});

describe("getMarketDataRoute", () => {
  it("addresses the market by reserve id", () => {
    expect(getMarketDataRoute(4n)).toBe("/markets/4");
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
