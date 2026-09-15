/**
 * Tests for useDepositValidation hook
 */

import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { useDepositValidation } from "../useDepositValidation";

// Mock the protocol params context
vi.mock("@/context/ProtocolParamsContext", () => ({
  useProtocolParamsContext: vi.fn(() => ({
    config: {
      minimumPegInAmount: 10000n,
      maxPegInAmount: 100_000_000n,
      pegInAckTimeout: 50400n,
      pegInActivationTimeout: 100800n,
    },
    minDeposit: 10000n,
    maxDeposit: 100_000_000n,
  })),
}));

describe("useDepositValidation", () => {
  const mockProviders = [
    "0x1234567890abcdef1234567890abcdef12345678",
    "0xabcdef1234567890abcdef1234567890abcdef12",
  ];

  describe("validateAmount", () => {
    it("should validate valid amount", () => {
      const { result } = renderHook(() =>
        useDepositValidation({ availableProviders: mockProviders }),
      );

      const validationResult = result.current.validateAmount("0.001");

      expect(validationResult.valid).toBe(true);
      expect(validationResult.error).toBeUndefined();
    });

    it("should reject invalid amount format", () => {
      const { result } = renderHook(() =>
        useDepositValidation({ availableProviders: mockProviders }),
      );

      const validationResult = result.current.validateAmount("invalid");

      expect(validationResult.valid).toBe(false);
      // parseBtcToSatoshis returns 0n for invalid input, which then fails > 0 check
      expect(validationResult.error).toContain("greater than zero");
    });

    it("should reject amount below minimum", () => {
      const { result } = renderHook(() =>
        useDepositValidation({ availableProviders: mockProviders }),
      );

      const validationResult = result.current.validateAmount("0.00001"); // Below minimum

      expect(validationResult.valid).toBe(false);
      expect(validationResult.error).toContain("Minimum deposit");
    });

    it("should use dynamic minimum based on fees", () => {
      const { result } = renderHook(() =>
        useDepositValidation({ availableProviders: mockProviders }),
      );

      expect(result.current.minDeposit).toBeGreaterThan(0n);
    });

    it("returns the 'capacity below minimum' error when remaining cap is below the minimum deposit", () => {
      // Remaining cap (5_000) is below the 10_000 minimum, so no amount can pass
      // both bounds. This must win over the base minimum error so the message
      // matches the CTA instead of telling the user to raise an amount they
      // can never raise high enough.
      const { result } = renderHook(() =>
        useDepositValidation({
          availableProviders: mockProviders,
          effectiveRemaining: 5_000n,
        }),
      );

      const validationResult = result.current.validateAmount("0.0001");

      expect(validationResult.valid).toBe(false);
      expect(validationResult.error).toBe(
        "Peg-in TVL cap reached — only 0.00005 BTC remains, below the minimum deposit of 0.0001 BTC",
      );
    });

    it("returns the 'minimum deposit' error when the fee-adjusted max is below the minimum deposit", () => {
      // maxDepositSats (8_000) is below the 10_000 minimum, so no amount is
      // valid. Must win over the base minimum error so the inline/submit path
      // matches the CTA instead of telling the user to raise an unraisable
      // amount.
      const { result } = renderHook(() =>
        useDepositValidation({
          availableProviders: mockProviders,
          maxDepositSats: 8_000n,
        }),
      );

      const validationResult = result.current.validateAmount("0.0001");

      expect(validationResult.valid).toBe(false);
      expect(validationResult.error).toContain("Minimum deposit is 0.0001");
    });
  });

  describe("validateProviders", () => {
    it("should validate single provider selection", () => {
      const { result } = renderHook(() =>
        useDepositValidation({ availableProviders: mockProviders }),
      );

      const validationResult = result.current.validateProviders([
        result.current.availableProviders[0],
      ]);

      expect(validationResult.valid).toBe(true);
    });

    it("should reject empty provider selection", () => {
      const { result } = renderHook(() =>
        useDepositValidation({ availableProviders: mockProviders }),
      );

      const validationResult = result.current.validateProviders([]);

      expect(validationResult.valid).toBe(false);
      expect(validationResult.error?.toLowerCase()).toContain("at least one");
    });

    it("should reject invalid provider", () => {
      const { result } = renderHook(() =>
        useDepositValidation({ availableProviders: mockProviders }),
      );

      const validationResult = result.current.validateProviders([
        "0xinvalidprovider",
      ]);

      expect(validationResult.valid).toBe(false);
      expect(validationResult.error).toContain("Invalid vault provider");
    });

    it("should reject multiple providers", () => {
      const { result } = renderHook(() =>
        useDepositValidation({ availableProviders: mockProviders }),
      );

      const validationResult = result.current.validateProviders(
        result.current.availableProviders,
      );

      expect(validationResult.valid).toBe(false);
      expect(validationResult.error).toContain(
        "Multiple providers not yet supported",
      );
    });
  });

  describe("provider fetching", () => {
    it("should return available providers", () => {
      const { result } = renderHook(() =>
        useDepositValidation({ availableProviders: mockProviders }),
      );

      expect(result.current.availableProviders).toEqual(mockProviders);
    });
  });

  describe("edge cases", () => {
    it("should reject amounts exceeding max deposit", () => {
      const { result } = renderHook(() =>
        useDepositValidation({ availableProviders: mockProviders }),
      );

      // maxDeposit is 100_000_000 satoshis = 1 BTC
      const validationResult = result.current.validateAmount("2");

      expect(validationResult.valid).toBe(false);
      expect(validationResult.error).toContain("Maximum deposit");
    });

    it("should handle negative amounts by stripping minus sign", () => {
      const { result } = renderHook(() =>
        useDepositValidation({ availableProviders: mockProviders }),
      );

      const validationResult = result.current.validateAmount("-0.001");

      // parseBtcToSatoshis strips non-numeric chars including '-', so '-0.001' becomes '0.001'
      // 0.001 BTC = 100000 sats, which is valid
      expect(validationResult.valid).toBe(true);
    });
  });

  describe("supply cap gating", () => {
    it("rejects amounts that exceed effectiveRemaining", () => {
      const { result } = renderHook(() =>
        useDepositValidation({
          availableProviders: mockProviders,
          // 0.0005 BTC remaining; 0.001 BTC requested → too large
          effectiveRemaining: 50_000n,
        }),
      );

      const validationResult = result.current.validateAmount("0.001");

      expect(validationResult.valid).toBe(false);
      expect(validationResult.error).toMatch(/Peg-in TVL cap reached/);
    });

    it("returns the supply-cap-reached error when remaining is zero", () => {
      const { result } = renderHook(() =>
        useDepositValidation({
          availableProviders: mockProviders,
          effectiveRemaining: 0n,
        }),
      );

      const validationResult = result.current.validateAmount("0.001");

      expect(validationResult.valid).toBe(false);
      expect(validationResult.error).toMatch(/supply cap reached/i);
    });

    it("accepts amounts when effectiveRemaining is null (no cap)", () => {
      const { result } = renderHook(() =>
        useDepositValidation({
          availableProviders: mockProviders,
          effectiveRemaining: null,
        }),
      );

      expect(result.current.validateAmount("0.001").valid).toBe(true);
    });

    it("blocks with an explicit error when capUnavailable is true", () => {
      const { result } = renderHook(() =>
        useDepositValidation({
          availableProviders: mockProviders,
          effectiveRemaining: null,
          capUnavailable: true,
        }),
      );

      const validationResult = result.current.validateAmount("0.001");

      expect(validationResult.valid).toBe(false);
      expect(validationResult.error).toMatch(/unable to verify supply cap/i);
    });
  });
});
