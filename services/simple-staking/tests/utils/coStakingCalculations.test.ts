import {
  calculateRequiredBabyTokens,
  calculateAdditionalBabyNeeded,
  formatNumber,
  formatBabyTokens,
} from "@/ui/common/utils/coStakingCalculations";

describe("calculateRequiredBabyTokens", () => {
  it("should calculate required ubbn for basic amounts", () => {
    expect(calculateRequiredBabyTokens(1000, 2)).toBe(2000);
    expect(calculateRequiredBabyTokens(5000, 1.5)).toBe(7500);
  });

  it("should handle zero satoshis", () => {
    expect(calculateRequiredBabyTokens(0, 2)).toBe(0);
  });

  it("should handle zero score ratio", () => {
    expect(calculateRequiredBabyTokens(1000, 0)).toBe(0);
  });

  it("should handle decimal score ratios", () => {
    expect(calculateRequiredBabyTokens(1000, 0.5)).toBe(500);
    expect(calculateRequiredBabyTokens(1000, 0.123)).toBe(123);
  });

  it("should handle large amounts", () => {
    expect(calculateRequiredBabyTokens(100000000, 10)).toBe(1000000000);
  });

  it("should handle fractional results", () => {
    expect(calculateRequiredBabyTokens(100, 1.234)).toBe(123.4);
  });
});

describe("calculateAdditionalBabyNeeded", () => {
  it("should calculate additional ubbn needed when undercollateralized", () => {
    expect(calculateAdditionalBabyNeeded(1000, 500, 2)).toBe(1500);
    expect(calculateAdditionalBabyNeeded(5000, 3000, 1.5)).toBe(4500);
  });

  it("should return 0 when already fully collateralized", () => {
    expect(calculateAdditionalBabyNeeded(1000, 2000, 2)).toBe(0);
  });

  it("should return 0 when overcollateralized", () => {
    expect(calculateAdditionalBabyNeeded(1000, 3000, 2)).toBe(0);
  });

  it("should handle zero active satoshis", () => {
    expect(calculateAdditionalBabyNeeded(0, 1000, 2)).toBe(0);
  });

  it("should handle zero current ubbn staked", () => {
    expect(calculateAdditionalBabyNeeded(1000, 0, 2)).toBe(2000);
  });

  it("should handle decimal score ratios", () => {
    expect(calculateAdditionalBabyNeeded(1000, 200, 0.5)).toBe(300);
  });

  it("should handle edge case where additional needed is exactly 0", () => {
    expect(calculateAdditionalBabyNeeded(1000, 1500, 1.5)).toBe(0);
  });
});

describe("formatNumber", () => {
  it("should format numbers to 2 decimal places by default", () => {
    expect(formatNumber(3.14159)).toBe("3.14");
    expect(formatNumber(5.2)).toBe("5.20");
  });

  it("should format numbers to specified decimal places", () => {
    expect(formatNumber(3.14159, 0)).toBe("3");
    expect(formatNumber(3.14159, 3)).toBe("3.142");
    expect(formatNumber(3.14159, 4)).toBe("3.1416");
  });

  it("should handle zero correctly", () => {
    expect(formatNumber(0)).toBe("0.00");
    expect(formatNumber(0, 3)).toBe("0.000");
  });

  it("should handle negative numbers", () => {
    expect(formatNumber(-3.14159, 2)).toBe("-3.14");
  });

  it("should handle integers", () => {
    expect(formatNumber(10)).toBe("10.00");
    expect(formatNumber(10, 0)).toBe("10");
  });

  it("should round correctly", () => {
    expect(formatNumber(1.006, 2)).toBe("1.01");
    expect(formatNumber(1.995, 2)).toBe("2.00");
  });
});

describe("formatBabyTokens", () => {
  it("should format large numbers in millions", () => {
    expect(formatBabyTokens(1000000)).toBe("1.00M");
    expect(formatBabyTokens(1500000)).toBe("1.50M");
    expect(formatBabyTokens(10000000)).toBe("10.00M");
  });

  it("should format medium numbers in thousands", () => {
    expect(formatBabyTokens(1000)).toBe("1.00K");
    expect(formatBabyTokens(5000)).toBe("5.00K");
    expect(formatBabyTokens(999999)).toBe("1000.00K");
  });

  it("should format small numbers without suffix", () => {
    expect(formatBabyTokens(1)).toBe("1.00");
    expect(formatBabyTokens(10)).toBe("10.00");
    expect(formatBabyTokens(999)).toBe("999.00");
  });

  it("should handle zero", () => {
    expect(formatBabyTokens(0)).toBe("0.00");
  });

  it("should handle decimal values correctly", () => {
    expect(formatBabyTokens(1234.5678)).toBe("1.23K");
    expect(formatBabyTokens(1234567.89)).toBe("1.23M");
  });

  it("should handle edge values at boundaries", () => {
    expect(formatBabyTokens(999.99)).toBe("999.99");
    expect(formatBabyTokens(1000.0)).toBe("1.00K");
    expect(formatBabyTokens(999999.99)).toBe("1000.00K");
    expect(formatBabyTokens(1000000.0)).toBe("1.00M");
  });

  it("should round to 2 decimal places", () => {
    expect(formatBabyTokens(1234.567)).toBe("1.23K");
    expect(formatBabyTokens(1235.999)).toBe("1.24K");
  });

  it("should handle negative numbers without suffix", () => {
    expect(formatBabyTokens(-1000)).toBe("-1000.00");
    expect(formatBabyTokens(-1000000)).toBe("-1000000.00");
    expect(formatBabyTokens(-100)).toBe("-100.00");
  });
});
