/**
 * Tests for useDepositValidation hook
 */

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useDepositValidation } from "../useDepositValidation";

// Mock the protocol params context
vi.mock("@/context/ProtocolParamsContext", () => ({
  useProtocolParamsContext: vi.fn(() => ({
    config: {
      minimumPegInAmount: 10000n,
      maxPegInAmount: 100_000_000n,
      pegInAckTimeout: 50400n,
      peginActivationTimeout: 100800n,
    },
    minDeposit: 10000n,
    maxDeposit: 100_000_000n,
  })),
}));

// Mock useQuery for provider fetching
vi.mock("@tanstack/react-query", async () => {
  const actual = await vi.importActual("@tanstack/react-query");
  return {
    ...actual,
    useQuery: vi.fn((options: any) => {
      // Mock provider query
      if (options.queryKey?.includes("vaultProviders")) {
        return {
          data: [
            "0x1234567890abcdef1234567890abcdef12345678",
            "0xabcdef1234567890abcdef1234567890abcdef12",
          ],
          isLoading: false,
          error: null,
        };
      }
      return {
        data: undefined,
        isLoading: false,
        error: null,
      };
    }),
  };
});

describe("useDepositValidation", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
      },
    });
  });

  const wrapper = ({ children }: { children: ReactNode }) => {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  };

  const mockProviders = [
    "0x1234567890abcdef1234567890abcdef12345678",
    "0xabcdef1234567890abcdef1234567890abcdef12",
  ];

  describe("validateAmount", () => {
    it("should validate valid amount", () => {
      const { result } = renderHook(
        () => useDepositValidation({ availableProviders: mockProviders }),
        {
          wrapper,
        },
      );

      const validationResult = result.current.validateAmount("0.001");

      expect(validationResult.valid).toBe(true);
      expect(validationResult.error).toBeUndefined();
    });

    it("should reject invalid amount format", () => {
      const { result } = renderHook(
        () => useDepositValidation({ availableProviders: mockProviders }),
        {
          wrapper,
        },
      );

      const validationResult = result.current.validateAmount("invalid");

      expect(validationResult.valid).toBe(false);
      // parseBtcToSatoshis returns 0n for invalid input, which then fails > 0 check
      expect(validationResult.error).toContain("greater than zero");
    });

    it("should reject amount below minimum", () => {
      const { result } = renderHook(
        () => useDepositValidation({ availableProviders: mockProviders }),
        {
          wrapper,
        },
      );

      const validationResult = result.current.validateAmount("0.00001"); // Below minimum

      expect(validationResult.valid).toBe(false);
      expect(validationResult.error).toContain("Minimum deposit");
    });

    it("should use dynamic minimum based on fees", () => {
      const { result } = renderHook(
        () => useDepositValidation({ availableProviders: mockProviders }),
        {
          wrapper,
        },
      );

      expect(result.current.minDeposit).toBeGreaterThan(0n);
    });
  });

  describe("validateProviders", () => {
    it.skip("should validate single provider selection", async () => {
      // TODO: Requires proper provider API mocking
      const { result } = renderHook(
        () => useDepositValidation({ availableProviders: mockProviders }),
        {
          wrapper,
        },
      );

      const validationResult = result.current.validateProviders([
        result.current.availableProviders[0],
      ]);

      expect(validationResult.valid).toBe(true);
    });

    it("should reject empty provider selection", () => {
      const { result } = renderHook(
        () => useDepositValidation({ availableProviders: mockProviders }),
        {
          wrapper,
        },
      );

      const validationResult = result.current.validateProviders([]);

      expect(validationResult.valid).toBe(false);
      expect(validationResult.error?.toLowerCase()).toContain("at least one");
    });

    it.skip("should reject invalid provider", async () => {
      // TODO: Requires proper provider API mocking
      const { result } = renderHook(
        () => useDepositValidation({ availableProviders: mockProviders }),
        {
          wrapper,
        },
      );

      const validationResult = result.current.validateProviders([
        "0xinvalidprovider",
      ]);

      expect(validationResult.valid).toBe(false);
      expect(validationResult.error).toContain("Invalid vault provider");
    });

    it.skip("should reject multiple providers", async () => {
      // TODO: Requires proper provider API mocking
      const { result } = renderHook(
        () => useDepositValidation({ availableProviders: mockProviders }),
        {
          wrapper,
        },
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
    it.skip("should fetch available providers", async () => {
      // TODO: Requires proper provider API mocking
      const { result } = renderHook(
        () => useDepositValidation({ availableProviders: mockProviders }),
        {
          wrapper,
        },
      );

      expect(result.current.availableProviders).toHaveLength(2);
      expect(result.current.availableProviders[0]).toBe(
        "0x1234567890abcdef1234567890abcdef12345678",
      );
    });

    it("should return available providers", () => {
      const { result } = renderHook(
        () => useDepositValidation({ availableProviders: mockProviders }),
        {
          wrapper,
        },
      );

      expect(result.current.availableProviders).toEqual(mockProviders);
    });
  });

  describe("edge cases", () => {
    it("should reject amounts exceeding max deposit", () => {
      const { result } = renderHook(
        () => useDepositValidation({ availableProviders: mockProviders }),
        {
          wrapper,
        },
      );

      // maxDeposit is 100_000_000 satoshis = 1 BTC
      const validationResult = result.current.validateAmount("2");

      expect(validationResult.valid).toBe(false);
      expect(validationResult.error).toContain("Maximum deposit");
    });

    it("should handle negative amounts by stripping minus sign", () => {
      const { result } = renderHook(
        () => useDepositValidation({ availableProviders: mockProviders }),
        {
          wrapper,
        },
      );

      const validationResult = result.current.validateAmount("-0.001");

      // parseBtcToSatoshis strips non-numeric chars including '-', so '-0.001' becomes '0.001'
      // 0.001 BTC = 100000 sats, which is valid
      expect(validationResult.valid).toBe(true);
    });
  });

  describe("supply cap gating", () => {
    it("rejects amounts that exceed effectiveRemaining", () => {
      const { result } = renderHook(
        () =>
          useDepositValidation({
            availableProviders: mockProviders,
            // 0.0005 BTC remaining; 0.001 BTC requested → too large
            effectiveRemaining: 50_000n,
          }),
        { wrapper },
      );

      const validationResult = result.current.validateAmount("0.001");

      expect(validationResult.valid).toBe(false);
      expect(validationResult.error).toMatch(/exceeds remaining capacity/i);
    });

    it("returns the supply-cap-reached error when remaining is zero", () => {
      const { result } = renderHook(
        () =>
          useDepositValidation({
            availableProviders: mockProviders,
            effectiveRemaining: 0n,
          }),
        { wrapper },
      );

      const validationResult = result.current.validateAmount("0.001");

      expect(validationResult.valid).toBe(false);
      expect(validationResult.error).toMatch(/supply cap reached/i);
    });

    it("accepts amounts when effectiveRemaining is null (no cap)", () => {
      const { result } = renderHook(
        () =>
          useDepositValidation({
            availableProviders: mockProviders,
            effectiveRemaining: null,
          }),
        { wrapper },
      );

      expect(result.current.validateAmount("0.001").valid).toBe(true);
    });

    it("blocks with an explicit error when capUnavailable is true", () => {
      const { result } = renderHook(
        () =>
          useDepositValidation({
            availableProviders: mockProviders,
            effectiveRemaining: null,
            capUnavailable: true,
          }),
        { wrapper },
      );

      const validationResult = result.current.validateAmount("0.001");

      expect(validationResult.valid).toBe(false);
      expect(validationResult.error).toMatch(/unable to verify supply cap/i);
    });
  });
});
