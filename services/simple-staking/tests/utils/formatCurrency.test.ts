import {
  formatCurrency,
  calculateTokenValueInCurrency,
  getMinimumDisplayUnit,
} from "@/ui/common/utils/formatCurrency";

describe("formatCurrency", () => {
  it("returns default zeroDisplay for 0", () => {
    expect(formatCurrency(0)).toBe("-");
  });

  it("returns custom zeroDisplay for 0", () => {
    expect(formatCurrency(0, { zeroDisplay: "0" })).toBe("0");
  });

  it("formats positive value with defaults", () => {
    expect(formatCurrency(1234.5)).toBe("$1,234.50");
  });

  it("shows less-than for very small non-zero", () => {
    expect(formatCurrency(0.0001)).toBe("< $0.01");
  });

  it("respects custom fraction digits", () => {
    const format = { minimumFractionDigits: 4, maximumFractionDigits: 4 };
    expect(formatCurrency(0.0001, { format })).toBe("$0.0001");
    expect(formatCurrency(0.00005, { format })).toBe("< $0.0001");
  });

  it("respects custom prefix", () => {
    expect(formatCurrency(10, { prefix: "₺" })).toBe("₺10.00");
  });
});

describe("calculateTokenValueInCurrency", () => {
  it("multiplies amount and price then formats", () => {
    expect(calculateTokenValueInCurrency(2, 3)).toBe("$6.00");
  });

  it("shows less-than for tiny product", () => {
    expect(calculateTokenValueInCurrency(1e-4, 1e-1)).toBe("< $0.01");
  });

  it("supports custom format and prefix", () => {
    const format = { minimumFractionDigits: 4, maximumFractionDigits: 4 };
    expect(
      calculateTokenValueInCurrency(0.123456, 10, { prefix: "₺", format }),
    ).toBe("₺1.2346");
  });
});

describe("getMinimumDisplayUnit", () => {
  it("uses minimumFractionDigits when provided", () => {
    expect(
      getMinimumDisplayUnit(
        { minimumFractionDigits: 2, maximumFractionDigits: 4 },
        8,
      ),
    ).toBe(0.01);
  });

  it("falls back to precision when format is undefined", () => {
    expect(getMinimumDisplayUnit(undefined, 3)).toBe(0.001);
  });

  it("falls back to precision when minimumFractionDigits is undefined", () => {
    expect(getMinimumDisplayUnit({ maximumFractionDigits: 5 }, 2)).toBe(0.01);
  });
});
