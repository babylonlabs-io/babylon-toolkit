/**
 * Tests for formatting utilities
 */

import { describe, expect, it } from "vitest";

import {
  formatBtcAmount,
  formatLLTV,
  formatProviderName,
  formatUsdValue,
} from "../formatting";

describe("Formatting Utilities", () => {
  describe("formatBtcAmount", () => {
    it("should format positive BTC amount with 8 decimals by default", () => {
      expect(formatBtcAmount(1.23456789)).toBe("1.23456789 BTC");
    });

    it("should format whole BTC amount", () => {
      expect(formatBtcAmount(1)).toBe("1.00000000 BTC");
    });

    it("should format small BTC amount", () => {
      expect(formatBtcAmount(0.00000001)).toBe("0.00000001 BTC");
    });

    it("should return '0 BTC' for zero amount", () => {
      expect(formatBtcAmount(0)).toBe("0 BTC");
    });

    it("should return '0 BTC' for negative amount", () => {
      expect(formatBtcAmount(-1)).toBe("0 BTC");
    });

    it("should respect custom decimal places", () => {
      expect(formatBtcAmount(1.23456789, 4)).toBe("1.2346 BTC");
      expect(formatBtcAmount(1.23456789, 2)).toBe("1.23 BTC");
    });

    it("should handle large BTC amounts", () => {
      expect(formatBtcAmount(21000000)).toBe("21000000.00000000 BTC");
    });
  });

  describe("formatUsdValue", () => {
    it("should format positive USD value with commas and 2 decimals", () => {
      expect(formatUsdValue(1234.56)).toBe("$1,234.56 USD");
    });

    it("should format whole USD value", () => {
      expect(formatUsdValue(1000)).toBe("$1,000.00 USD");
    });

    it("should format small USD value", () => {
      expect(formatUsdValue(0.01)).toBe("$0.01 USD");
    });

    it("should return '$0 USD' for zero value", () => {
      expect(formatUsdValue(0)).toBe("$0 USD");
    });

    it("should return '$0 USD' for negative value", () => {
      expect(formatUsdValue(-100)).toBe("$0 USD");
    });

    it("should handle large USD values with commas", () => {
      expect(formatUsdValue(1000000)).toBe("$1,000,000.00 USD");
    });

    it("should round to 2 decimal places", () => {
      expect(formatUsdValue(1234.567)).toBe("$1,234.57 USD");
    });
  });

  describe("formatLLTV", () => {
    it("should format LLTV from wei to percentage (string input)", () => {
      // 80% = 80 * 1e16 = 800000000000000000
      expect(formatLLTV("800000000000000000")).toBe("80.0%");
    });

    it("should format LLTV from wei to percentage (bigint input)", () => {
      expect(formatLLTV(800000000000000000n)).toBe("80.0%");
    });

    it("should handle 0% LLTV", () => {
      expect(formatLLTV(0n)).toBe("0.0%");
    });

    it("should handle 100% LLTV", () => {
      expect(formatLLTV(1000000000000000000n)).toBe("100.0%");
    });

    it("should format to 1 decimal place", () => {
      // 85.5% = 855000000000000000
      expect(formatLLTV(855000000000000000n)).toBe("85.5%");
    });
  });

  describe("formatProviderName", () => {
    it("should truncate provider ID with ellipsis", () => {
      const providerId = "0x1234567890abcdef1234567890abcdef12345678";
      expect(formatProviderName(providerId)).toBe("Provider 0x1234...5678");
    });

    it("should handle short provider IDs", () => {
      const providerId = "0x12345678";
      expect(formatProviderName(providerId)).toBe("Provider 0x1234...5678");
    });
  });
});
