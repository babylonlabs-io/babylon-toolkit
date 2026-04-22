/**
 * Tests for deposit validation functions
 */

import { describe, expect, it } from "vitest";

import type { UTXO } from "../../vault/vaultTransactionService";
import {
  type DepositCtaParams,
  getDepositButtonLabel,
  getDepositCtaState,
  validateMultiVaultDepositInputs,
  validateProviderSelection,
} from "../validations";

describe("Deposit Validations", () => {
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
      const result = validateProviderSelection(
        null as unknown as string[],
        availableProviders,
      );

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
      vaultProviderBtcPubkey: "a".repeat(64),
      vaultKeeperBtcPubkeys: ["b".repeat(64)],
      universalChallengerBtcPubkeys: ["c".repeat(64)],
      minDeposit: 10_000n,
      maxDeposit: 100_000n,
      htlcSecretHexesLength: 2,
      depositorSecretHashesLength: 2,
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
      ).toThrow("below minimum deposit");
    });

    it("throws when a vault amount exceeds maxDeposit", () => {
      expect(() =>
        validateMultiVaultDepositInputs({
          ...validInputs,
          vaultAmounts: [50_000n, 200_000n],
        }),
      ).toThrow("exceeds maximum deposit");
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

    it("throws when more than 2 vaults are requested", () => {
      expect(() =>
        validateMultiVaultDepositInputs({
          ...validInputs,
          vaultAmounts: [30_000n, 30_000n, 30_000n],
          htlcSecretHexesLength: 3,
          depositorSecretHashesLength: 3,
        }),
      ).toThrow("Maximum 2 vaults supported");
    });

    it("throws when BTC wallet is not connected", () => {
      expect(() =>
        validateMultiVaultDepositInputs({
          ...validInputs,
          btcAddress: undefined,
        }),
      ).toThrow("BTC wallet not connected");
    });

    it("throws when ETH wallet is not connected", () => {
      expect(() =>
        validateMultiVaultDepositInputs({
          ...validInputs,
          depositorEthAddress: undefined,
        }),
      ).toThrow("ETH wallet not connected");
    });

    it("throws when no providers are selected", () => {
      expect(() =>
        validateMultiVaultDepositInputs({
          ...validInputs,
          selectedProviders: [],
        }),
      ).toThrow("At least one vault provider required");
    });

    it("throws when multiple providers are selected", () => {
      expect(() =>
        validateMultiVaultDepositInputs({
          ...validInputs,
          selectedProviders: [
            "0x1234567890abcdef1234567890abcdef12345678",
            "0xabcdef1234567890abcdef1234567890abcdef12",
          ],
        }),
      ).toThrow("Multiple providers not yet supported");
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

  describe("getDepositCtaState", () => {
    const readyParams: DepositCtaParams = {
      amountSats: 100000n,
      minDeposit: 10000n,
      btcBalance: 1000000n,
      estimatedFeeSats: 1000n,
      depositorClaimValue: 5000n,
      isDepositDisabled: false,
      isGeoBlocked: false,
      isAddressBlocked: false,
      isWalletConnected: true,
      hasApplication: true,
      hasProvider: true,
      splitNotReady: false,
      isFeeError: false,
      feeError: null,
      feeDisabled: false,
    };

    it("returns enabled 'Deposit' when all conditions are met", () => {
      const result = getDepositCtaState(readyParams);
      expect(result).toEqual({ disabled: false, label: "Deposit" });
    });

    it("returns 'Depositing Unavailable' when deposits are disabled", () => {
      const result = getDepositCtaState({
        ...readyParams,
        isDepositDisabled: true,
      });
      expect(result).toEqual({
        disabled: true,
        label: "Depositing Unavailable",
      });
    });

    it("returns geo-blocked message when geo-blocked", () => {
      const result = getDepositCtaState({
        ...readyParams,
        isGeoBlocked: true,
      });
      expect(result).toEqual({
        disabled: true,
        label: "Service unavailable in your region",
      });
    });

    it("returns 'Wallet not eligible' when address is blocked", () => {
      const result = getDepositCtaState({
        ...readyParams,
        isAddressBlocked: true,
      });
      expect(result).toEqual({
        disabled: true,
        label: "Wallet not eligible",
      });
    });

    it("prioritizes geo-blocked over address-blocked", () => {
      const result = getDepositCtaState({
        ...readyParams,
        isGeoBlocked: true,
        isAddressBlocked: true,
      });
      expect(result.label).toBe("Service unavailable in your region");
    });

    it("returns 'Connect your wallet' when wallet is not connected", () => {
      const result = getDepositCtaState({
        ...readyParams,
        isWalletConnected: false,
      });
      expect(result).toEqual({
        disabled: true,
        label: "Connect your wallet",
      });
    });

    it("returns 'Select an application' when application is missing", () => {
      const result = getDepositCtaState({
        ...readyParams,
        hasApplication: false,
      });
      expect(result).toEqual({
        disabled: true,
        label: "Select an application",
      });
    });

    it("returns 'Select a vault provider' when provider is missing", () => {
      const result = getDepositCtaState({
        ...readyParams,
        hasProvider: false,
      });
      expect(result).toEqual({
        disabled: true,
        label: "Select a vault provider",
      });
    });

    it("returns split-not-ready message when split is not ready", () => {
      const result = getDepositCtaState({
        ...readyParams,
        splitNotReady: true,
      });
      expect(result).toEqual({
        disabled: true,
        label: "Deposit amount too low for 2-vault split",
      });
    });

    it("returns fee error message when fee estimation fails", () => {
      const result = getDepositCtaState({
        ...readyParams,
        isFeeError: true,
        feeError: "Network congestion",
      });
      expect(result).toEqual({
        disabled: true,
        label: "Network congestion",
      });
    });

    it("returns fallback fee error when feeError is null", () => {
      const result = getDepositCtaState({
        ...readyParams,
        isFeeError: true,
        feeError: null,
      });
      expect(result).toEqual({
        disabled: true,
        label: "Fee estimate unavailable",
      });
    });

    it("returns 'Calculating fees...' when fee is loading", () => {
      const result = getDepositCtaState({
        ...readyParams,
        feeDisabled: true,
      });
      expect(result).toEqual({
        disabled: true,
        label: "Calculating fees...",
      });
    });

    it("returns amount-level label when amount is invalid", () => {
      const result = getDepositCtaState({
        ...readyParams,
        amountSats: 5000n, // below minDeposit of 10000n
      });
      expect(result.disabled).toBe(true);
      expect(result.label).toContain("Minimum");
    });

    it("returns 'Enter an amount' when amount is zero", () => {
      const result = getDepositCtaState({
        ...readyParams,
        amountSats: 0n,
      });
      expect(result).toEqual({ disabled: true, label: "Enter an amount" });
    });

    it("returns 'Insufficient balance' when total exceeds balance", () => {
      const result = getDepositCtaState({
        ...readyParams,
        amountSats: 990000n,
        estimatedFeeSats: 20000n,
        depositorClaimValue: 0n,
      });
      expect(result).toEqual({
        disabled: true,
        label: "Insufficient balance",
      });
    });

    it("prioritizes deposit-disabled over geo-blocked", () => {
      const result = getDepositCtaState({
        ...readyParams,
        isDepositDisabled: true,
        isGeoBlocked: true,
      });
      expect(result.label).toBe("Depositing Unavailable");
    });

    it("prioritizes geo-blocked over wallet-not-connected", () => {
      const result = getDepositCtaState({
        ...readyParams,
        isGeoBlocked: true,
        isWalletConnected: false,
      });
      expect(result.label).toBe("Service unavailable in your region");
    });

    it("prioritizes fee error over fee loading", () => {
      const result = getDepositCtaState({
        ...readyParams,
        isFeeError: true,
        feeError: "RPC timeout",
        feeDisabled: true,
      });
      expect(result.label).toBe("RPC timeout");
    });

    it("shows 'Enter an amount' over fee-disabled when no amount entered", () => {
      const result = getDepositCtaState({
        ...readyParams,
        amountSats: 0n,
        feeDisabled: true,
      });
      expect(result.label).toBe("Enter an amount");
    });

    it("shows amount label over fee-disabled when amount is below minimum", () => {
      const result = getDepositCtaState({
        ...readyParams,
        amountSats: 5000n,
        feeDisabled: true,
      });
      expect(result.label).toContain("Minimum");
    });
  });
});
