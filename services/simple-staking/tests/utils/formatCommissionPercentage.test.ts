import { formatCommissionPercentage } from "@/ui/common/utils/formatCommissionPercentage";

describe("formatCommissionPercentage", () => {
  it("should format typical commission values correctly", () => {
    expect(formatCommissionPercentage(0.05)).toBe("5%");
    expect(formatCommissionPercentage(0.1)).toBe("10%");
    expect(formatCommissionPercentage(0.1234)).toBe("12.34%");
  });

  it("should format zero commission correctly", () => {
    expect(formatCommissionPercentage(0)).toBe("0%");
  });

  it("should format very small commission values correctly", () => {
    expect(formatCommissionPercentage(0.001)).toBe("0.1%");
    expect(formatCommissionPercentage(0.0001)).toBe("0.01%");
  });

  it("should format high commission values correctly", () => {
    expect(formatCommissionPercentage(0.5)).toBe("50%");
    expect(formatCommissionPercentage(0.99)).toBe("99%");
    expect(formatCommissionPercentage(1)).toBe("100%");
  });

  it("should round to 2 decimal places", () => {
    expect(formatCommissionPercentage(0.12345)).toBe("12.35%");
    expect(formatCommissionPercentage(0.12344)).toBe("12.34%");
    expect(formatCommissionPercentage(0.005)).toBe("0.5%");
  });

  it("should handle negative commission values", () => {
    expect(formatCommissionPercentage(-0.05)).toBe("-5%");
    expect(formatCommissionPercentage(-0.1234)).toBe("-12.34%");
  });

  it("should handle very large commission values", () => {
    expect(formatCommissionPercentage(2)).toBe("200%");
    expect(formatCommissionPercentage(10.5)).toBe("1050%");
  });

  it("should handle extremely small commission values", () => {
    expect(formatCommissionPercentage(0.000001)).toBe("0%");
    expect(formatCommissionPercentage(0.00001)).toBe("0%");
  });
});
