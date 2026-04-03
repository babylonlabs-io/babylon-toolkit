/**
 * Tests for deposit validation functions
 */

import { describe, expect, it } from "vitest";

import {
  getDepositButtonLabel,
  isDepositAmountValid,
  validateDepositAmount,
  validateMultiVaultDepositInputs,
  validateProviderSelection,
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

    it("should accept very large amounts when no maxDeposit", () => {
      const veryLargeAmount = 21_000_000_00_000_000n; // 21M BTC
      const result = validateDepositAmount(veryLargeAmount, minDeposit);

      expect(result.valid).toBe(true);
    });

    it("should reject amount exceeding maxDeposit", () => {
      const maxDeposit = 100_000_000n; // 1 BTC
      const result = validateDepositAmount(
        200_000_000n,
        minDeposit,
        maxDeposit,
      );

      expect(result.valid).toBe(false);
      expect(result.error).toContain("Maximum deposit");
    });

    it("should accept exact maxDeposit amount", () => {
      const maxDeposit = 100_000_000n;
      const result = validateDepositAmount(maxDeposit, minDeposit, maxDeposit);

      expect(result.valid).toBe(true);
    });

    it("should ignore maxDeposit when zero", () => {
      const result = validateDepositAmount(200_000_000n, minDeposit, 0n);

      expect(result.valid).toBe(true);
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
        estimatedFeeSats: 1000n,
        depositorClaimValue: 5000n,
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
        estimatedFeeSats: 0n,
        depositorClaimValue: 0n,
      });
      expect(result).toBe(true);
    });

    it("should return false when estimatedFeeSats is absent", () => {
      const result = isDepositAmountValid({
        amountSats: 100000n,
        minDeposit,
        btcBalance,
        depositorClaimValue: 5000n,
      });
      expect(result).toBe(false);
    });

    it("should return false when depositorClaimValue is absent", () => {
      const result = isDepositAmountValid({
        amountSats: 100000n,
        minDeposit,
        btcBalance,
        estimatedFeeSats: 5000n,
      });
      expect(result).toBe(false);
    });

    it("should return true for exact balance amount with zero fees", () => {
      const result = isDepositAmountValid({
        amountSats: btcBalance,
        minDeposit,
        btcBalance,
        estimatedFeeSats: 0n,
        depositorClaimValue: 0n,
      });
      expect(result).toBe(true);
    });

    it("should return false when amount + fees exceed balance", () => {
      const result = isDepositAmountValid({
        amountSats: 990000n,
        minDeposit,
        btcBalance,
        estimatedFeeSats: 20000n,
        depositorClaimValue: 0n,
      });
      // 990000 + 20000 = 1010000 > 1000000
      expect(result).toBe(false);
    });

    it("should return false when amount + fees + claimValue exceed balance", () => {
      const result = isDepositAmountValid({
        amountSats: 900000n,
        minDeposit,
        btcBalance,
        estimatedFeeSats: 5000n,
        depositorClaimValue: 100000n,
      });
      // 900000 + 5000 + 100000 = 1005000 > 1000000
      expect(result).toBe(false);
    });

    it("should return true when amount + fees + claimValue fit within balance", () => {
      const result = isDepositAmountValid({
        amountSats: 900000n,
        minDeposit,
        btcBalance,
        estimatedFeeSats: 5000n,
        depositorClaimValue: 50000n,
      });
      // 900000 + 5000 + 50000 = 955000 < 1000000
      expect(result).toBe(true);
    });

    it("should accept very large amounts if balance allows and no maxDeposit", () => {
      const largeBalance = 21_000_000_00_000_000n; // 21M BTC
      const result = isDepositAmountValid({
        amountSats: largeBalance,
        minDeposit,
        btcBalance: largeBalance,
        estimatedFeeSats: 0n,
        depositorClaimValue: 0n,
      });
      expect(result).toBe(true);
    });

    it("should return false for amount exceeding maxDeposit", () => {
      const maxDeposit = 500000n;
      const result = isDepositAmountValid({
        amountSats: 600000n,
        minDeposit,
        maxDeposit,
        btcBalance,
        estimatedFeeSats: 0n,
        depositorClaimValue: 0n,
      });
      expect(result).toBe(false);
    });

    it("should return true for amount at exact maxDeposit", () => {
      const maxDeposit = 500000n;
      const result = isDepositAmountValid({
        amountSats: maxDeposit,
        minDeposit,
        maxDeposit,
        btcBalance,
        estimatedFeeSats: 0n,
        depositorClaimValue: 0n,
      });
      expect(result).toBe(true);
    });
  });

  describe("validateMultiVaultDepositInputs", () => {
    const validInputs = {
      btcAddress: "bc1qtest",
      depositorEthAddress:
        "0x1234567890abcdef1234567890abcdef12345678" as `0x${string}`,
      vaultAmounts: [50_000n, 50_000n],
      selectedProviders: ["0x1234567890abcdef1234567890abcdef12345678"],
      confirmedUTXOs: [
        { txid: "0xabc", vout: 0, value: 200_000, scriptPubKey: "0xdef" },
      ] as UTXO[],
      isUTXOsLoading: false,
      utxoError: null,
      vaultProviderBtcPubkey: "a".repeat(64),
      vaultKeeperBtcPubkeys: ["b".repeat(64)],
      universalChallengerBtcPubkeys: ["c".repeat(64)],
      minDeposit: 10_000n,
      maxDeposit: 100_000n,
    };

    it("passes when all vault amounts are within min/max range", () => {
      expect(() => validateMultiVaultDepositInputs(validInputs)).not.toThrow();
    });

    it("throws when a vault amount is below minDeposit", () => {
      expect(() =>
        validateMultiVaultDepositInputs({
          ...validInputs,
          vaultAmounts: [5_000n, 50_000n],
        }),
      ).toThrow("Vault 1: Minimum deposit");
    });

    it("throws when a vault amount exceeds maxDeposit", () => {
      expect(() =>
        validateMultiVaultDepositInputs({
          ...validInputs,
          vaultAmounts: [50_000n, 200_000n],
        }),
      ).toThrow("Vault 2: Maximum deposit");
    });

    it("passes when maxDeposit is undefined", () => {
      expect(() =>
        validateMultiVaultDepositInputs({
          ...validInputs,
          maxDeposit: undefined,
          vaultAmounts: [50_000n, 500_000n],
        }),
      ).not.toThrow();
    });
  });

  describe("getDepositButtonLabel", () => {
    const minDeposit = 10000n;
    const btcBalance = 1000000n;

    it("should show 'Enter an amount' for zero amount", () => {
      expect(
        getDepositButtonLabel({ amountSats: 0n, minDeposit, btcBalance }),
      ).toBe("Enter an amount");
    });

    it("should show 'Calculating fees...' when fees are absent", () => {
      expect(
        getDepositButtonLabel({ amountSats: 100000n, minDeposit, btcBalance }),
      ).toBe("Calculating fees...");
    });

    it("should show 'Deposit' for valid amount", () => {
      expect(
        getDepositButtonLabel({
          amountSats: 100000n,
          minDeposit,
          btcBalance,
          estimatedFeeSats: 1000n,
          depositorClaimValue: 5000n,
        }),
      ).toBe("Deposit");
    });

    it("should show minimum message for amount below min", () => {
      const label = getDepositButtonLabel({
        amountSats: 5000n,
        minDeposit,
        btcBalance,
        estimatedFeeSats: 1000n,
        depositorClaimValue: 5000n,
      });
      expect(label).toContain("Minimum");
    });

    it("should show maximum message for amount above max", () => {
      const maxDeposit = 500000n;
      const label = getDepositButtonLabel({
        amountSats: 600000n,
        minDeposit,
        maxDeposit,
        btcBalance,
        estimatedFeeSats: 1000n,
        depositorClaimValue: 5000n,
      });
      expect(label).toContain("Maximum");
    });

    it("should show 'Insufficient balance' when exceeding balance", () => {
      expect(
        getDepositButtonLabel({
          amountSats: btcBalance + 1n,
          minDeposit,
          btcBalance,
          estimatedFeeSats: 0n,
          depositorClaimValue: 0n,
        }),
      ).toBe("Insufficient balance");
    });

    it("should show 'Insufficient balance' when amount + fees exceed balance", () => {
      expect(
        getDepositButtonLabel({
          amountSats: 990000n,
          minDeposit,
          btcBalance,
          estimatedFeeSats: 20000n,
          depositorClaimValue: 0n,
        }),
      ).toBe("Insufficient balance");
    });

    it("should show 'Insufficient balance' when amount + fees + claimValue exceed balance", () => {
      expect(
        getDepositButtonLabel({
          amountSats: 900000n,
          minDeposit,
          btcBalance,
          estimatedFeeSats: 5000n,
          depositorClaimValue: 100000n,
        }),
      ).toBe("Insufficient balance");
    });

    it("should show 'Deposit' when amount + fees + claimValue fit within balance", () => {
      expect(
        getDepositButtonLabel({
          amountSats: 900000n,
          minDeposit,
          btcBalance,
          estimatedFeeSats: 5000n,
          depositorClaimValue: 50000n,
        }),
      ).toBe("Deposit");
    });
  });
});
