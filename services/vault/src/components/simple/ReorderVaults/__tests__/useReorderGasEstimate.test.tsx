/**
 * Tests for useReorderGasEstimate — the "Ethereum network fee" row of the
 * Reorder dialog. A Sepolia fee is far below the shown precision and must
 * not render as zero (#2827).
 */

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import type { Hex } from "viem";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockEstimateGas = vi.fn();
const mockGetGasPrice = vi.fn();
vi.mock("@/clients/eth-contract/client", () => ({
  ethClient: {
    getPublicClient: () => ({
      estimateGas: (...args: unknown[]) => mockEstimateGas(...args),
      getGasPrice: () => mockGetGasPrice(),
    }),
  },
}));

vi.mock("@/context/wallet", () => ({
  useETHWallet: () => ({
    address: "0x000000000000000000000000000000000000beef",
  }),
}));

const mockEthPrice = vi.fn();
vi.mock("@/hooks/usePrices", () => ({
  usePrice: () => mockEthPrice(),
}));

vi.mock("@/applications/aave/config", () => ({
  getAaveAdapterAddress: () => "0xaaaa000000000000000000000000000000000ada",
}));

import { useReorderGasEstimate } from "../useReorderGasEstimate";

const VAULT_IDS: Hex[] = [
  "0xbbbb000000000000000000000000000000000000000000000000000000000002",
  "0xaaaa000000000000000000000000000000000000000000000000000000000001",
];

function wrapper({ children }: { children: ReactNode }) {
  // The hook sets its own `retry: 1`; a zero delay keeps the failure test fast.
  const client = new QueryClient({
    defaultOptions: { queries: { retryDelay: 0 } },
  });
  return createElement(QueryClientProvider, { client }, children);
}

describe("useReorderGasEstimate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockEthPrice.mockReturnValue(3_000);
  });

  it("shows a fee below 0.000001 ETH as < 0.000001 ETH, not 0.000000 ETH", async () => {
    // A Sepolia reorder: 100,000 gas at 19 wei costs 1.9e-12 ETH.
    mockEstimateGas.mockResolvedValue(100_000n);
    mockGetGasPrice.mockResolvedValue(19n);

    const { result } = renderHook(
      () => useReorderGasEstimate(VAULT_IDS, true),
      { wrapper },
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.feeEth).toBe("< 0.000001 ETH");
    expect(result.current.feeUsd).toBe("(< $0.01 USD)");
    expect(result.current.isError).toBe(false);
  });

  it("shows 0.000005 ETH for 100,000 gas at 53,219,829 wei", async () => {
    mockEstimateGas.mockResolvedValue(100_000n);
    mockGetGasPrice.mockResolvedValue(53_219_829n);

    const { result } = renderHook(
      () => useReorderGasEstimate(VAULT_IDS, true),
      { wrapper },
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.feeEth).toBe("0.000005 ETH");
    expect(result.current.feeUsd).toBe("($0.02 USD)");
  });

  it("shows a zero fee as 0 ETH, not the unavailable look-alike", async () => {
    // A dev chain can quote a gas price of 0.
    mockEstimateGas.mockResolvedValue(100_000n);
    mockGetGasPrice.mockResolvedValue(0n);

    const { result } = renderHook(
      () => useReorderGasEstimate(VAULT_IDS, true),
      { wrapper },
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.feeEth).toBe("0 ETH");
    expect(result.current.feeUsd).toBe("($0 USD)");
  });

  it("shows the unavailable placeholder when the estimate fails", async () => {
    mockEstimateGas.mockRejectedValue(new Error("execution reverted"));
    mockGetGasPrice.mockResolvedValue(19n);

    const { result } = renderHook(
      () => useReorderGasEstimate(VAULT_IDS, true),
      { wrapper },
    );

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.feeEth).toBe("-- ETH");
    expect(result.current.feeUsd).toBe("");
  });
});
