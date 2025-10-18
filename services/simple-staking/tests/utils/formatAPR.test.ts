import {
  formatAPRPercentage,
  formatAPRWithSymbol,
  formatAPRPairAdaptive,
} from "@/ui/common/utils/formatAPR";

describe("formatAPR utils", () => {
  test("returns 0.00 for null/zero", () => {
    expect(formatAPRPercentage(null)).toBe("0.00");
    expect(formatAPRPercentage(0)).toBe("0.00");
  });

  test("formats normal values with 2 decimals", () => {
    expect(formatAPRPercentage(5.2)).toBe("5.20");
    expect(formatAPRPercentage(1.235)).toBe("1.24");
  });

  test("shows <0.001 for tiny values", () => {
    expect(formatAPRWithSymbol(0.0000001)).toBe("<0.001%");
  });

  test("uses 3 decimals for small values and floors", () => {
    expect(formatAPRPercentage(0.001)).toBe("0.001");
    expect(formatAPRPercentage(0.0015)).toBe("0.001"); // floor, not round
    expect(formatAPRPercentage(0.0099)).toBe("0.009");
  });

  test("adaptive formatter increases decimals to distinguish values", () => {
    const { a, b, decimalsUsed } = formatAPRPairAdaptive(0.0011, 0.00115);
    expect(a).not.toBe(b);
    expect(decimalsUsed).toBeGreaterThanOrEqual(4);
  });

  test("adaptive formatter for normal values distinguishes at 4 decimals", () => {
    const { a, b, decimalsUsed } = formatAPRPairAdaptive(0.01, 0.0101);
    expect(a).toBe("0.0100");
    expect(b).toBe("0.0101");
    expect(decimalsUsed).toBe(4);
  });

  test("adaptive formatter with tiny vs small value uses up to max decimals", () => {
    const { a, b, decimalsUsed } = formatAPRPairAdaptive(0.0000001, 0.0005);
    // Values are distinguished at 4 decimals: 0.0000 vs 0.0005
    expect(a).toBe("0.0000");
    expect(b).toBe("0.0005");
    expect(decimalsUsed).toBeGreaterThanOrEqual(4);
  });

  test("adaptive formatter returns identical strings when truly equal", () => {
    const { a, b, decimalsUsed } = formatAPRPairAdaptive(0.009, 0.009);
    expect(a).toBe("0.009");
    expect(b).toBe("0.009");
    expect(decimalsUsed).toBe(3);
  });

  test("options: disable floorSmall to round small values", () => {
    expect(formatAPRPercentage(0.0015, { floorSmall: false })).toBe("0.002");
  });

  test("options: custom less-than threshold works", () => {
    expect(formatAPRWithSymbol(0.00005, { lessThanThreshold: 0.0001 })).toBe(
      "<0.0001%",
    );
  });
});
