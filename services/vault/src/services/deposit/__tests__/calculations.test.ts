/**
 * Tests for deposit calculation functions
 */

import { describe, expect, it } from "vitest";

import type { UTXO } from "../../vault/vaultTransactionService";
import {
  calculateDepositFees,
  calculateMinimumDeposit,
  estimateTransactionSize,
  selectOptimalUTXOs,
} from "../calculations";

describe("Deposit Calculations", () => {
  describe("calculateDepositFees", () => {
    it("should calculate fees correctly", () => {
      const depositAmount = 100000n; // 0.001 BTC

      const fees = calculateDepositFees(depositAmount);

      expect(fees.btcNetworkFee).toBe(10000n); // Fixed fee from config
      expect(fees.protocolFee).toBe(100n); // 0.1% of 100000 = 100
      expect(fees.totalFee).toBe(fees.btcNetworkFee + fees.protocolFee);
    });

    it("should use fixed network fee", () => {
      const depositAmount = 100000n;

      const fees = calculateDepositFees(depositAmount);

      // Network fee should be the fixed value
      expect(fees.btcNetworkFee).toBe(10000n); // Fixed fee from config
    });

    it("should handle zero deposit amount", () => {
      const fees = calculateDepositFees(0n);

      expect(fees.btcNetworkFee).toBe(10000n); // Fixed network fee still applies
      expect(fees.protocolFee).toBe(0n); // 0.1% of 0 is 0
      expect(fees.totalFee).toBe(fees.btcNetworkFee);
    });

    it("should handle large deposit amounts", () => {
      const largeAmount = 21000000_00000000n; // 21M BTC (max supply)
      const fees = calculateDepositFees(largeAmount);

      expect(fees.protocolFee).toBe(21000000_00000n); // 0.1% of max supply
      expect(fees.totalFee).toBeGreaterThan(0n);
    });
  });

  describe("selectOptimalUTXOs", () => {
    const mockUTXOs: UTXO[] = [
      { txid: "tx1", vout: 0, value: 50000, scriptPubKey: "script1" },
      { txid: "tx2", vout: 0, value: 100000, scriptPubKey: "script2" },
      { txid: "tx3", vout: 0, value: 25000, scriptPubKey: "script3" },
      { txid: "tx4", vout: 0, value: 200000, scriptPubKey: "script4" },
    ];

    it("should select single UTXO when sufficient", () => {
      const targetAmount = 150000n;

      const result = selectOptimalUTXOs(mockUTXOs, targetAmount);

      expect(result.selected).toHaveLength(1);
      expect(result.selected[0].value).toBe(200000); // Should select the 200k UTXO
      expect(result.totalValue).toBe(200000n);
    });

    it("should select multiple UTXOs when needed", () => {
      const targetAmount = 250000n;

      const result = selectOptimalUTXOs(mockUTXOs, targetAmount);

      expect(result.selected.length).toBeGreaterThan(1);
      expect(result.totalValue).toBeGreaterThanOrEqual(targetAmount);
    });

    it("should select largest UTXOs first for efficiency", () => {
      const targetAmount = 300000n;

      const result = selectOptimalUTXOs(mockUTXOs, targetAmount);

      // Should select 200k and 100k UTXOs (largest first)
      expect(result.selected).toContainEqual(
        expect.objectContaining({ value: 200000 }),
      );
      expect(result.selected).toContainEqual(
        expect.objectContaining({ value: 100000 }),
      );
      expect(result.totalValue).toBe(300000n);
    });

    it("should return all UTXOs if target exceeds total", () => {
      const targetAmount = 1000000n; // More than sum of all UTXOs

      const result = selectOptimalUTXOs(mockUTXOs, targetAmount);

      expect(result.selected).toHaveLength(mockUTXOs.length);
      expect(result.totalValue).toBe(375000n); // Sum of all UTXOs
    });

    it("should handle empty UTXO array", () => {
      const result = selectOptimalUTXOs([], 100000n);

      expect(result.selected).toHaveLength(0);
      expect(result.totalValue).toBe(0n);
    });

    it("should not modify original UTXO array", () => {
      const originalLength = mockUTXOs.length;
      const originalFirst = mockUTXOs[0];

      selectOptimalUTXOs(mockUTXOs, 100000n);

      expect(mockUTXOs).toHaveLength(originalLength);
      expect(mockUTXOs[0]).toBe(originalFirst);
    });
  });

  describe("estimateTransactionSize", () => {
    it("should calculate size for single input/output", () => {
      const size = estimateTransactionSize(1, 1);

      expect(size).toBeGreaterThan(0);
      expect(size).toBeLessThan(200); // Reasonable upper bound
    });

    it("should increase with more inputs", () => {
      const size1 = estimateTransactionSize(1, 1);
      const size5 = estimateTransactionSize(5, 1);

      expect(size5).toBeGreaterThan(size1);
    });

    it("should increase with more outputs", () => {
      const size1 = estimateTransactionSize(1, 1);
      const size2 = estimateTransactionSize(1, 2);

      expect(size2).toBeGreaterThan(size1);
    });

    it("should handle zero inputs/outputs", () => {
      const size = estimateTransactionSize(0, 0);

      expect(size).toBe(11); // Base size only
    });

    it("should calculate correctly for typical transaction", () => {
      // Typical: 2 inputs, 2 outputs (payment + change)
      const size = estimateTransactionSize(2, 2);

      expect(size).toBe(11 + 58 * 2 + 43 * 2); // Base + inputs + outputs
      expect(size).toBe(213);
    });
  });

  describe("calculateMinimumDeposit", () => {
    it("should calculate minimum based on fee rate", () => {
      const feeRate = 10; // sats/byte
      const minimum = calculateMinimumDeposit(feeRate);

      expect(minimum).toBeGreaterThan(0n);
      expect(minimum).toBeGreaterThanOrEqual(10000n); // At least 0.0001 BTC
    });

    it("should increase with higher fee rates", () => {
      const min10 = calculateMinimumDeposit(10);
      const min50 = calculateMinimumDeposit(50);

      expect(min50).toBeGreaterThan(min10);
    });

    it("should handle zero fee rate", () => {
      const minimum = calculateMinimumDeposit(0);

      expect(minimum).toBe(10000n); // Just the base minimum
    });

    it("should handle high fee rate", () => {
      const feeRate = 1000; // Very high fee rate
      const minimum = calculateMinimumDeposit(feeRate);

      expect(minimum).toBeGreaterThan(10000n);
      expect(minimum).toBeLessThan(1000000n); // Still reasonable
    });
  });
});
