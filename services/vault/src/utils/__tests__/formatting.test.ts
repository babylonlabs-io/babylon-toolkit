/**
 * Tests for formatting utilities
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { getNetworkConfigBTC } from "@/config";

import {
  formatBtcAmount,
  formatDateTime,
  formatLLTV,
  formatProviderName,
  formatTimeAgo,
  formatUsdValue,
} from "../formatting";

const btcConfig = getNetworkConfigBTC();

describe("Formatting Utilities", () => {
  describe("formatBtcAmount", () => {
    it("should format positive BTC amount with 8 decimals by default", () => {
      expect(formatBtcAmount(1.23456789)).toBe(
        `1.23456789 ${btcConfig.coinSymbol}`,
      );
    });

    it("should format whole BTC amount", () => {
      expect(formatBtcAmount(1)).toBe(`1 ${btcConfig.coinSymbol}`);
    });

    it("should format small BTC amount", () => {
      expect(formatBtcAmount(0.00000001)).toBe(
        `0.00000001 ${btcConfig.coinSymbol}`,
      );
    });

    it("should return '0 BTC' for zero amount", () => {
      expect(formatBtcAmount(0)).toBe(`0 ${btcConfig.coinSymbol}`);
    });

    it("should return '0 BTC' for negative amount", () => {
      expect(formatBtcAmount(-1)).toBe(`0 ${btcConfig.coinSymbol}`);
    });

    it("should respect custom decimal places", () => {
      expect(formatBtcAmount(1.23456789, 4)).toBe(
        `1.2346 ${btcConfig.coinSymbol}`,
      );
      expect(formatBtcAmount(1.23456789, 2)).toBe(
        `1.23 ${btcConfig.coinSymbol}`,
      );
    });

    it("should handle large BTC amounts", () => {
      expect(formatBtcAmount(21000000)).toBe(`21000000 ${btcConfig.coinSymbol}`);
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

  describe("formatDateTime", () => {
    it("should format date as YYYY-MM-DD HH:mm:ss", () => {
      const date = new Date(2024, 0, 15, 9, 5, 30); // Jan 15, 2024 09:05:30
      expect(formatDateTime(date)).toBe("2024-01-15 09:05:30");
    });

    it("should pad single digit month, day, hour, minute, second with zeros", () => {
      const date = new Date(2024, 0, 5, 3, 7, 9); // Jan 5, 2024 03:07:09
      expect(formatDateTime(date)).toBe("2024-01-05 03:07:09");
    });

    it("should handle midnight correctly", () => {
      const date = new Date(2024, 5, 20, 0, 0, 0); // Jun 20, 2024 00:00:00
      expect(formatDateTime(date)).toBe("2024-06-20 00:00:00");
    });

    it("should handle end of day correctly", () => {
      const date = new Date(2024, 11, 31, 23, 59, 59); // Dec 31, 2024 23:59:59
      expect(formatDateTime(date)).toBe("2024-12-31 23:59:59");
    });

    it("should handle double digit months and days", () => {
      const date = new Date(2024, 10, 25, 14, 30, 45); // Nov 25, 2024 14:30:45
      expect(formatDateTime(date)).toBe("2024-11-25 14:30:45");
    });
  });

  describe("formatTimeAgo", () => {
    const NOW = 1700000000000;

    beforeEach(() => {
      vi.spyOn(Date, "now").mockReturnValue(NOW);
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it("should return 'just now' for timestamps less than a minute ago", () => {
      expect(formatTimeAgo(NOW)).toBe("just now");
      expect(formatTimeAgo(NOW - 30 * 1000)).toBe("just now");
      expect(formatTimeAgo(NOW - 59 * 1000)).toBe("just now");
    });

    it("should return 'a minute ago' for exactly 1 minute", () => {
      expect(formatTimeAgo(NOW - 60 * 1000)).toBe("a minute ago");
    });

    it("should return plural minutes for 2-59 minutes", () => {
      expect(formatTimeAgo(NOW - 2 * 60 * 1000)).toBe("2 minutes ago");
      expect(formatTimeAgo(NOW - 30 * 60 * 1000)).toBe("30 minutes ago");
      expect(formatTimeAgo(NOW - 59 * 60 * 1000)).toBe("59 minutes ago");
    });

    it("should return 'an hour ago' for exactly 1 hour", () => {
      expect(formatTimeAgo(NOW - 60 * 60 * 1000)).toBe("an hour ago");
    });

    it("should return plural hours for 2-23 hours", () => {
      expect(formatTimeAgo(NOW - 2 * 60 * 60 * 1000)).toBe("2 hours ago");
      expect(formatTimeAgo(NOW - 12 * 60 * 60 * 1000)).toBe("12 hours ago");
      expect(formatTimeAgo(NOW - 23 * 60 * 60 * 1000)).toBe("23 hours ago");
    });

    it("should return 'a day ago' for exactly 1 day", () => {
      expect(formatTimeAgo(NOW - 24 * 60 * 60 * 1000)).toBe("a day ago");
    });

    it("should return plural days for 2-29 days", () => {
      expect(formatTimeAgo(NOW - 2 * 24 * 60 * 60 * 1000)).toBe("2 days ago");
      expect(formatTimeAgo(NOW - 15 * 24 * 60 * 60 * 1000)).toBe("15 days ago");
      expect(formatTimeAgo(NOW - 29 * 24 * 60 * 60 * 1000)).toBe("29 days ago");
    });

    it("should return 'a month ago' for exactly 1 month (30 days)", () => {
      expect(formatTimeAgo(NOW - 30 * 24 * 60 * 60 * 1000)).toBe("a month ago");
    });

    it("should return plural months for 2-11 months", () => {
      expect(formatTimeAgo(NOW - 60 * 24 * 60 * 60 * 1000)).toBe(
        "2 months ago",
      );
      expect(formatTimeAgo(NOW - 180 * 24 * 60 * 60 * 1000)).toBe(
        "6 months ago",
      );
      expect(formatTimeAgo(NOW - 330 * 24 * 60 * 60 * 1000)).toBe(
        "11 months ago",
      );
    });

    it("should return 'a year ago' for exactly 1 year (365 days)", () => {
      expect(formatTimeAgo(NOW - 365 * 24 * 60 * 60 * 1000)).toBe("a year ago");
    });

    it("should return plural years for 2+ years", () => {
      expect(formatTimeAgo(NOW - 730 * 24 * 60 * 60 * 1000)).toBe(
        "2 years ago",
      );
      expect(formatTimeAgo(NOW - 1825 * 24 * 60 * 60 * 1000)).toBe(
        "5 years ago",
      );
    });

    it("should return 'just now' for future timestamps", () => {
      expect(formatTimeAgo(NOW + 1000)).toBe("just now");
      expect(formatTimeAgo(NOW + 60 * 60 * 1000)).toBe("just now");
      expect(formatTimeAgo(NOW + 365 * 24 * 60 * 60 * 1000)).toBe("just now");
    });
  });
});
