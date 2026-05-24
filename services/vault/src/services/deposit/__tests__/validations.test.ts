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
        }),
      ).toThrow("Maximum 2 BTC Vaults supported");
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
      hasProvider: true,
      splitNotReady: false,
      isFeeError: false,
      feeError: null,
      feeDisabled: false,
      ordinalsCheckPending: false,
      hasWalletConnectionError: false,
      isReconnectingWallet: false,
      maxDepositSats: null,
      effectiveRemaining: null,
      capUnavailable: false,
      minPeginFee: 500n,
      minPeginFeeError: null,
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

    it("returns enabled 'Reconnect Wallet' when wallet liveness probe failed", () => {
      const result = getDepositCtaState({
        ...readyParams,
        hasWalletConnectionError: true,
      });
      expect(result).toEqual({ disabled: false, label: "Reconnect Wallet" });
    });

    it("returns disabled 'Reconnecting Wallet...' while reconnect is in flight", () => {
      const result = getDepositCtaState({
        ...readyParams,
        hasWalletConnectionError: true,
        isReconnectingWallet: true,
      });
      expect(result).toEqual({
        disabled: true,
        label: "Reconnecting Wallet...",
      });
    });

    it("prioritizes wallet-not-connected over reconnect CTA", () => {
      const result = getDepositCtaState({
        ...readyParams,
        isWalletConnected: false,
        hasWalletConnectionError: true,
      });
      expect(result.label).toBe("Connect your wallet");
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
        label: "Deposit amount too low to split into 2 BTC Vaults",
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

    it("disables with inscription-check label while ordinals check is pending", () => {
      const result = getDepositCtaState({
        ...readyParams,
        ordinalsCheckPending: true,
      });
      expect(result).toEqual({
        disabled: true,
        label: "Checking for inscriptions...",
      });
    });

    it("returns 'Insufficient balance' when amount exceeds the fee-adjusted max", () => {
      const result = getDepositCtaState({
        ...readyParams,
        amountSats: 100001n,
        maxDepositSats: 100000n,
      });
      expect(result).toEqual({
        disabled: true,
        label: "Insufficient balance",
      });
    });

    it("shows 'Insufficient balance' over 'Select a vault provider' when amount exceeds the fee-adjusted max", () => {
      const result = getDepositCtaState({
        ...readyParams,
        amountSats: 100001n,
        maxDepositSats: 100000n,
        hasProvider: false,
      });
      expect(result.label).toBe("Insufficient balance");
    });

    it("allows an amount equal to the fee-adjusted max", () => {
      const result = getDepositCtaState({
        ...readyParams,
        amountSats: 100000n,
        maxDepositSats: 100000n,
      });
      expect(result).toEqual({ disabled: false, label: "Deposit" });
    });

    it("shows the cap message, not 'Insufficient balance', when the supply cap is the binding max", () => {
      // The supply cap is the limiter: maxDepositSats is clamped to
      // effectiveRemaining, so an over-cap amount also exceeds maxDepositSats.
      // The wallet has ample balance, so "Insufficient balance" would be wrong.
      const result = getDepositCtaState({
        ...readyParams,
        amountSats: 800_000n,
        maxDepositSats: 500_000n,
        effectiveRemaining: 500_000n,
      });
      expect(result).toEqual({
        disabled: true,
        label: "Vault size exceeds remaining capacity (0.005 BTC)",
      });
    });

    it("shows 'Insufficient balance' when the fee-adjusted max (not the cap) is the limiter", () => {
      // maxDepositSats is below effectiveRemaining, so the limit is balance/fees
      // rather than the supply cap — "Insufficient balance" is the right label.
      const result = getDepositCtaState({
        ...readyParams,
        amountSats: 100_001n,
        maxDepositSats: 100_000n,
        effectiveRemaining: 500_000n,
      });
      expect(result).toEqual({
        disabled: true,
        label: "Insufficient balance",
      });
    });

    it("prioritizes amount label over ordinals-pending", () => {
      const result = getDepositCtaState({
        ...readyParams,
        amountSats: 0n,
        ordinalsCheckPending: true,
      });
      expect(result.label).toBe("Enter an amount");
    });

    it("disables with cap-unavailable label when capUnavailable is true", () => {
      const result = getDepositCtaState({
        ...readyParams,
        capUnavailable: true,
      });
      expect(result).toEqual({
        disabled: true,
        label: "Unable to verify supply cap — please try again",
      });
    });

    it("returns 'Supply cap reached' when effectiveRemaining is zero", () => {
      const result = getDepositCtaState({
        ...readyParams,
        effectiveRemaining: 0n,
      });
      expect(result).toEqual({
        disabled: true,
        label: "Supply cap reached — deposits temporarily paused",
      });
    });

    it("returns 'Vault size exceeds remaining capacity' when amount > effectiveRemaining", () => {
      // Amount + fee + claim (806_000) still fits readyParams.btcBalance
      // (1_000_000), so this test isolates the cap branch from the balance
      // check. effectiveRemaining 500_000 sats = "0.005" via
      // formatSatoshisToBtc (trailing zeros stripped).
      const result = getDepositCtaState({
        ...readyParams,
        amountSats: 800_000n,
        effectiveRemaining: 500_000n,
      });
      expect(result).toEqual({
        disabled: true,
        label: "Vault size exceeds remaining capacity (0.005 BTC)",
      });
    });

    it("allows an amount equal to effectiveRemaining", () => {
      const result = getDepositCtaState({
        ...readyParams,
        amountSats: 500_000n,
        effectiveRemaining: 500_000n,
      });
      expect(result).toEqual({ disabled: false, label: "Deposit" });
    });

    it("disables with 'Calculating fees...' when minPeginFee is still loading", () => {
      const result = getDepositCtaState({
        ...readyParams,
        minPeginFee: null,
      });
      expect(result).toEqual({
        disabled: true,
        label: "Calculating fees...",
      });
    });

    it("allows submit at zero amount even when minPeginFee is null (no submit race possible)", () => {
      // amount = 0n routes to "Enter an amount" via getDepositButtonLabel
      // before the minPeginFee gate fires, so a freshly-loaded form with
      // no amount yet shows the right prompt rather than a confusing
      // "Calculating fees..." label.
      const result = getDepositCtaState({
        ...readyParams,
        amountSats: 0n,
        minPeginFee: null,
      });
      expect(result.label).toBe("Enter an amount");
    });

    it("disables with 'Fee estimate unavailable' when minPeginFee query errored", () => {
      const result = getDepositCtaState({
        ...readyParams,
        minPeginFeeError: new Error("WASM init failed"),
      });
      expect(result).toEqual({
        disabled: true,
        label: "Fee estimate unavailable",
      });
    });

    it("prioritizes minPeginFee error over loading state", () => {
      // Both error AND loading would be impossible in practice, but lock in
      // the precedence so a future regression that surfaces both doesn't
      // silently fall back to the loading label.
      const result = getDepositCtaState({
        ...readyParams,
        minPeginFee: null,
        minPeginFeeError: new Error("boom"),
      });
      expect(result.label).toBe("Fee estimate unavailable");
    });
  });
});
