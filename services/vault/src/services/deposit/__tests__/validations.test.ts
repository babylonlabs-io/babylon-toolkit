/**
 * Tests for deposit validation functions
 */

import { describe, expect, it } from "vitest";

import type { UTXO } from "../../vault/vaultTransactionService";
import {
  isDepositAmountValid,
  validateDepositAmount,
  validateProviderSelection,
  validateSufficientBalance,
  validateUTXOs,
} from "../validations";

describe("Deposit Validations", () => {
  describe("validateDepositAmount", () => {
    const minDeposit = 10000n; // 0.0001 BTC

    it("should accept valid deposit amount", () => {
      const result = validateDepositAmount(100000n, minDeposit);

      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it("should reject zero amount", () => {
      const result = validateDepositAmount(0n, minDeposit);

      expect(result.valid).toBe(false);
      expect(result.error).toContain("greater than zero");
    });

    it("should reject negative amount", () => {
      const result = validateDepositAmount(-1000n, minDeposit);

      expect(result.valid).toBe(false);
      expect(result.error).toContain("greater than zero");
    });

    it("should reject amount below minimum", () => {
      const result = validateDepositAmount(5000n, minDeposit);

      expect(result.valid).toBe(false);
      expect(result.error).toContain("Minimum deposit");
    });

    it("should accept exact minimum amount", () => {
      const result = validateDepositAmount(minDeposit, minDeposit);

      expect(result.valid).toBe(true);
    });

    it("should accept very large amounts (no max limit)", () => {
      const veryLargeAmount = 21_000_000_00_000_000n; // 21M BTC
      const result = validateDepositAmount(veryLargeAmount, minDeposit);

      expect(result.valid).toBe(true);
    });
  });

  describe("validateSufficientBalance", () => {
    it("should accept sufficient balance", () => {
      const result = validateSufficientBalance(100000n, 200000n);

      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it("should reject insufficient balance", () => {
      const result = validateSufficientBalance(100000n, 50000n);

      expect(result.valid).toBe(false);
      expect(result.error).toContain("Insufficient balance");
      expect(result.error).toContain("50000"); // Shows shortage amount
    });

    it("should accept exact balance", () => {
      const result = validateSufficientBalance(100000n, 100000n);

      expect(result.valid).toBe(true);
    });

    it("should handle zero required amount", () => {
      const result = validateSufficientBalance(0n, 100000n);

      expect(result.valid).toBe(true);
    });

    it("should handle zero balance with non-zero required", () => {
      const result = validateSufficientBalance(100000n, 0n);

      expect(result.valid).toBe(false);
      expect(result.error).toContain("100000");
    });
  });

  describe("validateUTXOs", () => {
    const validUTXOs: UTXO[] = [
      { txid: "0x123", vout: 0, value: 50000, scriptPubKey: "0xabc" },
      { txid: "0x456", vout: 1, value: 100000, scriptPubKey: "0xdef" },
    ];

    it("should accept valid UTXOs with sufficient value", () => {
      const result = validateUTXOs(validUTXOs, 100000n);

      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it("should reject empty UTXO array", () => {
      const result = validateUTXOs([], 100000n);

      expect(result.valid).toBe(false);
      expect(result.error).toContain("No UTXOs available");
    });

    it("should reject null/undefined UTXOs", () => {
      const result = validateUTXOs(null as any, 100000n);

      expect(result.valid).toBe(false);
      expect(result.error).toContain("No UTXOs available");
    });

    it("should reject invalid UTXOs (missing txid)", () => {
      const invalidUTXOs: UTXO[] = [
        { txid: "", vout: 0, value: 50000, scriptPubKey: "0xabc" },
      ];

      const result = validateUTXOs(invalidUTXOs, 10000n);

      expect(result.valid).toBe(false);
      expect(result.error).toContain("invalid UTXOs");
    });

    it("should reject invalid UTXOs (invalid vout)", () => {
      const invalidUTXOs: UTXO[] = [
        {
          txid: "0x123",
          vout: undefined as any,
          value: 50000,
          scriptPubKey: "0xabc",
        },
      ];

      const result = validateUTXOs(invalidUTXOs, 10000n);

      expect(result.valid).toBe(false);
      expect(result.error).toContain("invalid UTXOs");
    });

    it("should reject invalid UTXOs (zero or negative value)", () => {
      const invalidUTXOs: UTXO[] = [
        { txid: "0x123", vout: 0, value: 0, scriptPubKey: "0xabc" },
        { txid: "0x456", vout: 1, value: -100, scriptPubKey: "0xdef" },
      ];

      const result = validateUTXOs(invalidUTXOs, 10000n);

      expect(result.valid).toBe(false);
      expect(result.error).toContain("invalid UTXOs");
    });

    it("should reject insufficient UTXO value", () => {
      const result = validateUTXOs(validUTXOs, 200000n); // Total is 150000

      expect(result.valid).toBe(false);
      expect(result.error).toContain("don't have sufficient value");
    });

    it("should warn about too many UTXOs", () => {
      const manyUTXOs: UTXO[] = Array.from({ length: 15 }, (_, i) => ({
        txid: `0x${i}`,
        vout: i,
        value: 10000,
        scriptPubKey: `0x${i}`,
      }));

      const result = validateUTXOs(manyUTXOs, 50000n);

      expect(result.valid).toBe(true);
      expect(result.warnings).toBeDefined();
      expect(result.warnings![0]).toContain("increase transaction fees");
    });
  });

  describe("validateProviderSelection", () => {
    const availableProviders = [
      "0x1234567890abcdef1234567890abcdef12345678",
      "0xabcdef1234567890abcdef1234567890abcdef12",
      "0x9876543210fedcba9876543210fedcba98765432",
    ];

    it("should accept valid single provider", () => {
      const result = validateProviderSelection(
        [availableProviders[0]],
        availableProviders,
      );

      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it("should reject empty provider selection", () => {
      const result = validateProviderSelection([], availableProviders);

      expect(result.valid).toBe(false);
      expect(result.error?.toLowerCase()).toContain("at least one");
    });

    it("should reject null/undefined providers", () => {
      const result = validateProviderSelection(null as any, availableProviders);

      expect(result.valid).toBe(false);
      expect(result.error?.toLowerCase()).toContain("at least one");
    });

    it("should reject invalid provider", () => {
      const result = validateProviderSelection(
        ["0xinvalid"],
        availableProviders,
      );

      expect(result.valid).toBe(false);
      expect(result.error).toContain("Invalid vault provider");
    });

    it("should reject multiple providers (not yet supported)", () => {
      const result = validateProviderSelection(
        [availableProviders[0], availableProviders[1]],
        availableProviders,
      );

      expect(result.valid).toBe(false);
      expect(result.error).toContain("Multiple providers not yet supported");
    });

    it("should handle empty available providers list", () => {
      const result = validateProviderSelection(["0x123"], []);

      expect(result.valid).toBe(false);
      expect(result.error).toContain("Invalid vault provider");
    });
  });

  describe("isDepositAmountValid", () => {
    const minDeposit = 10000n;
    const btcBalance = 1000000n; // 0.01 BTC

    it("should return true for valid deposit within all constraints", () => {
      const result = isDepositAmountValid({
        amountSats: 100000n,
        minDeposit,
        btcBalance,
      });
      expect(result).toBe(true);
    });

    it("should return false for zero amount", () => {
      const result = isDepositAmountValid({
        amountSats: 0n,
        minDeposit,
        btcBalance,
      });
      expect(result).toBe(false);
    });

    it("should return false for amount below minimum", () => {
      const result = isDepositAmountValid({
        amountSats: 5000n, // below 10000n min
        minDeposit,
        btcBalance,
      });
      expect(result).toBe(false);
    });

    it("should return false for amount exceeding balance", () => {
      const result = isDepositAmountValid({
        amountSats: btcBalance + 1n,
        minDeposit,
        btcBalance,
      });
      expect(result).toBe(false);
    });

    it("should return true for exact minimum amount", () => {
      const result = isDepositAmountValid({
        amountSats: minDeposit,
        minDeposit,
        btcBalance,
      });
      expect(result).toBe(true);
    });

    it("should return true for exact balance amount", () => {
      const result = isDepositAmountValid({
        amountSats: btcBalance,
        minDeposit,
        btcBalance,
      });
      expect(result).toBe(true);
    });

    it("should accept very large amounts if balance allows (no max limit)", () => {
      const largeBalance = 21_000_000_00_000_000n; // 21M BTC
      const result = isDepositAmountValid({
        amountSats: largeBalance,
        minDeposit,
        btcBalance: largeBalance,
      });
      expect(result).toBe(true);
    });
  });
});
