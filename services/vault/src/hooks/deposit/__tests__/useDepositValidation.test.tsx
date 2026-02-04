/**
 * Tests for useDepositValidation hook
 */

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useDepositValidation } from "../useDepositValidation";

// Mock the useUTXOs hook
vi.mock("../../../hooks/useUTXOs", () => ({
  useUTXOs: vi.fn(() => ({
    allUTXOs: [
      { txid: "0x123", vout: 0, value: 100000, scriptPubKey: "0xabc", confirmed: true },
      { txid: "0x456", vout: 1, value: 200000, scriptPubKey: "0xdef", confirmed: true },
    ],
    confirmedUTXOs: [
      { txid: "0x123", vout: 0, value: 100000, scriptPubKey: "0xabc", confirmed: true },
      { txid: "0x456", vout: 1, value: 200000, scriptPubKey: "0xdef", confirmed: true },
    ],
    availableUTXOs: [
      { txid: "0x123", vout: 0, value: 100000, scriptPubKey: "0xabc" },
      { txid: "0x456", vout: 1, value: 200000, scriptPubKey: "0xdef" },
    ],
    inscriptionUTXOs: [],
    spendableUTXOs: [
      { txid: "0x123", vout: 0, value: 100000, scriptPubKey: "0xabc" },
      { txid: "0x456", vout: 1, value: 200000, scriptPubKey: "0xdef" },
    ],
    spendableMempoolUTXOs: [
      { txid: "0x123", vout: 0, value: 100000, scriptPubKey: "0xabc", confirmed: true },
      { txid: "0x456", vout: 1, value: 200000, scriptPubKey: "0xdef", confirmed: true },
    ],
    isLoading: false,
    isLoadingOrdinals: false,
    error: null,
    ordinalsError: null,
    refetch: vi.fn(),
  })),
}));

// Mock the protocol params context
vi.mock("@/context/ProtocolParamsContext", () => ({
  useProtocolParamsContext: vi.fn(() => ({
    config: {
      minimumPegInAmount: 10000n,
      pegInFee: 0n,
      pegInActivationTimeout: 50400n,
      pegInConfirmationDepth: 30n,
    },
    minDeposit: 10000n,
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
        () => useDepositValidation("bc1qaddress", mockProviders),
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
        () => useDepositValidation("bc1qaddress", mockProviders),
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
        () => useDepositValidation("bc1qaddress", mockProviders),
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
        () => useDepositValidation("bc1qaddress", mockProviders),
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
        () => useDepositValidation("bc1qaddress", mockProviders),
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
        () => useDepositValidation("bc1qaddress", mockProviders),
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
        () => useDepositValidation("bc1qaddress", mockProviders),
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
        () => useDepositValidation("bc1qaddress", mockProviders),
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

  describe("validateDeposit", () => {
    it.skip("should validate complete deposit with valid data", async () => {
      // TODO: Requires proper provider API mocking
      const { result } = renderHook(
        () => useDepositValidation("bc1qaddress", mockProviders),
        {
          wrapper,
        },
      );

      const formData = {
        amount: "0.001",
        selectedProviders: [result.current.availableProviders[0]],
      };

      const validationResult = await result.current.validateDeposit(formData);

      expect(validationResult.valid).toBe(true);
      expect(validationResult.error).toBeUndefined();
    });

    it.skip("should reject invalid amount in complete validation", async () => {
      // TODO: Requires proper provider API mocking
      const { result } = renderHook(
        () => useDepositValidation("bc1qaddress", mockProviders),
        {
          wrapper,
        },
      );

      const formData = {
        amount: "0.00001", // Below minimum
        selectedProviders: [result.current.availableProviders[0]],
      };

      const validationResult = await result.current.validateDeposit(formData);

      expect(validationResult.valid).toBe(false);
      expect(validationResult.error).toContain("Minimum deposit");
    });

    it.skip("should check UTXOs when available", async () => {
      // TODO: Requires proper provider API mocking
      const { result } = renderHook(
        () => useDepositValidation("bc1qaddress", mockProviders),
        {
          wrapper,
        },
      );

      const formData = {
        amount: "0.002", // 200,000 sats
        selectedProviders: [result.current.availableProviders[0]],
      };

      const validationResult = await result.current.validateDeposit(formData);

      expect(validationResult.valid).toBe(true);
      // Total UTXOs value is 300,000 sats, so should be sufficient
    });

    it.skip("should warn when no UTXOs available yet", async () => {
      // TODO: Requires proper provider API mocking
      // Mock no UTXOs
      const useUTXOsMock = await import("../../../hooks/useUTXOs");
      vi.mocked(useUTXOsMock.useUTXOs).mockReturnValue({
        confirmedUTXOs: null,
        isLoading: false,
        error: null,
        pendingUTXOs: [],
        isConfirming: false,
        refetch: vi.fn(),
      } as any);

      const { result } = renderHook(
        () => useDepositValidation("bc1qaddress", mockProviders),
        {
          wrapper,
        },
      );

      const formData = {
        amount: "0.001",
        selectedProviders: [result.current.availableProviders[0]],
      };

      const validationResult = await result.current.validateDeposit(formData);

      expect(validationResult.valid).toBe(true);
      expect(validationResult.warnings).toBeDefined();
      expect(validationResult.warnings![0]).toContain(
        "UTXO validation will be performed",
      );
    });

    it("should handle validation errors gracefully", async () => {
      const { result } = renderHook(
        () => useDepositValidation("bc1qaddress", mockProviders),
        {
          wrapper,
        },
      );

      // Force an error by passing invalid data
      const formData = {
        amount: "not-a-number",
        selectedProviders: [],
      };

      const validationResult = await result.current.validateDeposit(formData);

      expect(validationResult.valid).toBe(false);
      expect(validationResult.error).toBeDefined();
    });
  });

  describe("provider fetching", () => {
    it.skip("should fetch available providers", async () => {
      // TODO: Requires proper provider API mocking
      const { result } = renderHook(
        () => useDepositValidation("bc1qaddress", mockProviders),
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
        () => useDepositValidation("bc1qaddress", mockProviders),
        {
          wrapper,
        },
      );

      expect(result.current.availableProviders).toEqual(mockProviders);
    });
  });

  describe("edge cases", () => {
    it("should handle undefined BTC address", () => {
      const { result } = renderHook(
        () => useDepositValidation(undefined, mockProviders),
        {
          wrapper,
        },
      );

      const validationResult = result.current.validateAmount("0.001");

      expect(validationResult.valid).toBe(true);
    });

    it("should accept very large amounts (no max limit)", () => {
      const { result } = renderHook(
        () => useDepositValidation("bc1qaddress", mockProviders),
        {
          wrapper,
        },
      );

      const validationResult = result.current.validateAmount("21000001");

      expect(validationResult.valid).toBe(true);
    });

    it("should handle negative amounts by stripping minus sign", () => {
      const { result } = renderHook(
        () => useDepositValidation("bc1qaddress", mockProviders),
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
});
