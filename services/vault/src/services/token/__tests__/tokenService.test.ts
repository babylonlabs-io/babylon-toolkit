import { describe, expect, it } from "vitest";

import { getCurrencyIconWithFallback } from "@/services/token/tokenService";

describe("getCurrencyIconWithFallback", () => {
  it("returns the provided icon when set", () => {
    expect(getCurrencyIconWithFallback("/images/usdc.png", "USDC")).toBe(
      "/images/usdc.png",
    );
  });

  it("falls back to the symbol-based path for known symbols when icon is missing", () => {
    expect(getCurrencyIconWithFallback(undefined, "USDC")).toBe(
      "/images/usdc.png",
    );
    expect(getCurrencyIconWithFallback(undefined, "usdt")).toBe(
      "/images/usdt.png",
    );
  });

  it("renders a letter SVG data URI when both icon and known symbol are missing", () => {
    const result = getCurrencyIconWithFallback(undefined, "FOO");
    expect(result.startsWith("data:image/svg+xml,")).toBe(true);
    // The generated SVG encodes the first letter of the symbol, uppercased.
    expect(decodeURIComponent(result)).toMatch(/<text[^>]*>\s*F\s*<\/text>/);
  });
});
