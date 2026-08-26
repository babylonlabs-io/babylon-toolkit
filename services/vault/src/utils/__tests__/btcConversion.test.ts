import { describe, expect, it } from "vitest";

import { formatSatoshisToBtcDisplay } from "../btcConversion";

describe("formatSatoshisToBtcDisplay", () => {
  it("inserts thousands separators on the integer part", () => {
    expect(formatSatoshisToBtcDisplay(100_000_000_000n)).toBe("1,000");
    expect(formatSatoshisToBtcDisplay(1_000_000_000_000n)).toBe("10,000");
    expect(formatSatoshisToBtcDisplay(21_000_000n * 100_000_000n)).toBe(
      "21,000,000",
    );
  });

  it("preserves the fractional part and drops trailing zeros", () => {
    expect(formatSatoshisToBtcDisplay(150_000_000n)).toBe("1.5");
    expect(formatSatoshisToBtcDisplay(123_456_78n)).toBe("0.12345678");
  });

  it("emits no separator for values under 1,000", () => {
    expect(formatSatoshisToBtcDisplay(0n)).toBe("0");
    expect(formatSatoshisToBtcDisplay(999n * 100_000_000n)).toBe("999");
  });

  it("respects the decimals override", () => {
    expect(formatSatoshisToBtcDisplay(123_456_78n, 2)).toBe("0.12");
  });
});
