import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import {
  calculateDynamicBtcFee,
  estimatePeginTxSize,
  FeePriority,
  fetchBtcFeeRates,
  formatFeeRate,
} from "../btcFeeService";

// Mock the config module
vi.mock("@babylonlabs-io/config", () => ({
  getNetworkConfigBTC: () => ({
    mempoolApiUrl: "https://mempool.space",
    network: "mainnet",
  }),
}));

// Mock fetch globally
global.fetch = vi.fn();

describe("BTC Fee Service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("estimatePeginTxSize", () => {
    it("should estimate transaction size for single P2WPKH input", () => {
      const size = estimatePeginTxSize({ numInputs: 1 });
      
      // Expected: ~10.5 (overhead) + 68 (P2WPKH input) + 43 (vault output) + 31 (change) = ~152.5
      expect(size).toBe(153);
    });

    it("should estimate transaction size for multiple inputs", () => {
      const size = estimatePeginTxSize({ numInputs: 3 });
      
      // Expected: ~10.5 + (3 * 68) + 43 + 31 = ~288.5
      expect(size).toBe(289);
    });

    it("should estimate transaction size for P2TR inputs", () => {
      const size = estimatePeginTxSize({ 
        numInputs: 2, 
        inputType: "P2TR" 
      });
      
      // Expected: ~10.5 + (2 * 57.5) + 43 + 31 = ~199.5
      expect(size).toBe(200);
    });

    it("should estimate transaction size without change output", () => {
      const size = estimatePeginTxSize({ 
        numInputs: 1, 
        hasChangeOutput: false 
      });
      
      // Expected: ~10.5 + 68 + 43 = ~121.5
      expect(size).toBe(122);
    });
  });

  describe("fetchBtcFeeRates", () => {
    it("should fetch fee rates from mempool API", async () => {
      const mockResponse = {
        fastestFee: 50,
        halfHourFee: 30,
        hourFee: 20,
        economyFee: 10,
        minimumFee: 1,
      };

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      const rates = await fetchBtcFeeRates();

      expect(fetch).toHaveBeenCalledWith(
        "https://mempool.space/api/v1/fees/recommended"
      );
      expect(rates).toEqual(mockResponse);
    });

    it("should return fallback rates on API error", async () => {
      (global.fetch as any).mockRejectedValueOnce(new Error("Network error"));

      const rates = await fetchBtcFeeRates();

      // Should return fallback rates
      expect(rates.fastestFee).toBeGreaterThan(0);
      expect(rates.halfHourFee).toBeGreaterThan(0);
      expect(rates.hourFee).toBeGreaterThan(0);
      expect(rates.economyFee).toBeGreaterThan(0);
      expect(rates.minimumFee).toBeGreaterThan(0);
    });
  });

  describe("calculateDynamicBtcFee", () => {
    it("should calculate fee with custom rate", async () => {
      const fee = await calculateDynamicBtcFee(1, FeePriority.FASTEST, 100);
      
      // 153 vbytes * 100 sat/vbyte = 15300 sats
      expect(fee).toBe(15300n);
    });

    it("should calculate fee with fetched rates", async () => {
      const mockResponse = {
        fastestFee: 50,
        halfHourFee: 30,
        hourFee: 20,
        economyFee: 10,
        minimumFee: 1,
      };

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      const fee = await calculateDynamicBtcFee(2, FeePriority.HALF_HOUR);
      
      // 221 vbytes * 30 sat/vbyte = 6630 sats
      expect(fee).toBe(6630n);
    });

    it("should handle different priority levels", async () => {
      const mockResponse = {
        fastestFee: 50,
        halfHourFee: 30,
        hourFee: 20,
        economyFee: 10,
        minimumFee: 1,
      };

      (global.fetch as any).mockResolvedValue({
        ok: true,
        json: async () => mockResponse,
      });

      const fastestFee = await calculateDynamicBtcFee(1, FeePriority.FASTEST);
      const economyFee = await calculateDynamicBtcFee(1, FeePriority.ECONOMY);
      
      expect(fastestFee).toBeGreaterThan(economyFee);
      expect(fastestFee).toBe(7650n); // 153 * 50
      expect(economyFee).toBe(1530n); // 153 * 10
    });
  });

  describe("formatFeeRate", () => {
    it("should format fee rate for display", () => {
      expect(formatFeeRate(25)).toBe("25 sat/vB");
      expect(formatFeeRate(100)).toBe("100 sat/vB");
    });
  });
});
