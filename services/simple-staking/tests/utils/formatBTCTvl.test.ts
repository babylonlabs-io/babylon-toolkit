import { formatBTCTvl } from "@/ui/common/utils/formatBTCTvl";

describe("formatBTCTvl", () => {
  it("should format values >= 1 with 2 decimal places", () => {
    expect(formatBTCTvl(1, "BTC")).toBe("1 BTC");
    expect(formatBTCTvl(10.5, "BTC")).toBe("10.5 BTC");
    expect(formatBTCTvl(100.123456, "BTC")).toBe("100.12 BTC");
  });

  it("should format values < 1 with 8 decimal places", () => {
    expect(formatBTCTvl(0.5, "BTC")).toBe("0.5 BTC");
    expect(formatBTCTvl(0.12345678, "BTC")).toBe("0.12345678 BTC");
    expect(formatBTCTvl(0.123456789, "BTC")).toBe("0.12345679 BTC");
  });

  it("should include USD value when rate is provided and displayUSD is true", () => {
    expect(formatBTCTvl(1, "BTC", 50000, true)).toBe("1 BTC ($50K)");
    expect(formatBTCTvl(2.5, "BTC", 50000, true)).toBe("2.5 BTC ($125K)");
    expect(formatBTCTvl(0.1, "BTC", 50000, true)).toBe("0.1 BTC ($5K)");
  });

  it("should format USD value with compact notation", () => {
    expect(formatBTCTvl(1, "BTC", 1000, true)).toBe("1 BTC ($1K)");
    expect(formatBTCTvl(1, "BTC", 1000000, true)).toBe("1 BTC ($1M)");
    expect(formatBTCTvl(10, "BTC", 50000, true)).toBe("10 BTC ($500K)");
  });

  it("should limit USD value to 2 decimal places", () => {
    expect(formatBTCTvl(1.123456, "BTC", 1000, true)).toBe("1.12 BTC ($1.12K)");
    expect(formatBTCTvl(0.00123456, "BTC", 50000, true)).toBe(
      "0.00123456 BTC ($61.73)",
    );
  });

  it("should not include USD value when displayUSD is false", () => {
    expect(formatBTCTvl(1, "BTC", 50000, false)).toBe("1 BTC");
    expect(formatBTCTvl(2.5, "BTC", 50000, false)).toBe("2.5 BTC");
    expect(formatBTCTvl(0.1, "BTC", 50000, false)).toBe("0.1 BTC");
  });

  it("should not include USD value when rate is undefined", () => {
    expect(formatBTCTvl(1, "BTC", undefined, true)).toBe("1 BTC");
    expect(formatBTCTvl(2.5, "BTC")).toBe("2.5 BTC");
  });

  it("should handle different coin symbols", () => {
    expect(formatBTCTvl(1, "ETH")).toBe("1 ETH");
    expect(formatBTCTvl(0.5, "USDC")).toBe("0.5 USDC");
  });

  it("should handle zero correctly", () => {
    expect(formatBTCTvl(0, "BTC")).toBe("0 BTC");
    expect(formatBTCTvl(0, "BTC", 50000, true)).toBe("0 BTC ($0)");
  });

  it("should handle very large values", () => {
    expect(formatBTCTvl(1000000, "BTC")).toBe("1000000 BTC");
    expect(formatBTCTvl(1000000, "BTC", 50000, true)).toBe(
      "1000000 BTC ($50B)",
    );
  });

  // TODO: make sure this is expected behavior
  // it("should handle very small values", () => {
  //   expect(formatBTCTvl(0.00000001, "BTC")).toBe("1e-8 BTC");
  //   expect(formatBTCTvl(0.00000001, "BTC", 50000, true)).toBe("1e-8 BTC ($0)");
  // });

  it("should handle boundary case at 1 BTC", () => {
    expect(formatBTCTvl(0.99999999, "BTC")).toBe("0.99999999 BTC");
    expect(formatBTCTvl(1, "BTC")).toBe("1 BTC");
    expect(formatBTCTvl(1.00000001, "BTC")).toBe("1 BTC");
  });

  it("should handle zero rate", () => {
    // Zero rate is falsy, so USD part is not displayed
    expect(formatBTCTvl(1, "BTC", 0, true)).toBe("1 BTC");
    expect(formatBTCTvl(5, "BTC", 0, true)).toBe("5 BTC");
  });

  it("should use default displayUSD value when not provided", () => {
    // displayUSD defaults to true
    expect(formatBTCTvl(1, "BTC", 50000)).toBe("1 BTC ($50K)");
  });

  it("should handle negative values (edge case)", () => {
    expect(formatBTCTvl(-1, "BTC")).toBe("-1 BTC");
    expect(formatBTCTvl(-0.5, "BTC")).toBe("-0.5 BTC");
    expect(formatBTCTvl(-1, "BTC", 50000, true)).toBe("-1 BTC ($-50K)");
  });
});
