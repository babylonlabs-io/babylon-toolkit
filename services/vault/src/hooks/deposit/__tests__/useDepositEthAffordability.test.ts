import { estimateSubmitPeginRequestBatchGas } from "@babylonlabs-io/ts-sdk/tbv/core";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import type { Address } from "viem";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useDepositEthAffordability } from "../useDepositEthAffordability";

const mockGetBalance = vi.fn();
const mockGetGasPrice = vi.fn();

vi.mock("@/clients/eth-contract/client", () => ({
  ethClient: {
    getPublicClient: () => ({
      getBalance: mockGetBalance,
      getGasPrice: mockGetGasPrice,
    }),
  },
}));

vi.mock("@/config/contracts", () => ({
  CONTRACTS: {
    BTC_VAULT_REGISTRY: "0x2222222222222222222222222222222222222222",
  },
}));

vi.mock("@babylonlabs-io/ts-sdk/tbv/core", () => ({
  estimateSubmitPeginRequestBatchGas: vi.fn(),
}));

const mockEstimateGas = vi.mocked(estimateSubmitPeginRequestBatchGas);

const ETH_ADDRESS = "0x1111111111111111111111111111111111111111" as Address;
const PROVIDER = "0x3333333333333333333333333333333333333333" as Address;
const FEE_WEI = 1_000_000_000_000_000n; // 0.001 ETH protocol fee
const GAS_UNITS = 200_000n;
const GAS_PRICE = 20_000_000_000n; // 20 gwei
// 200000 * 20gwei = 4e15, * 1.2 buffer = 4.8e15
const BUFFERED_GAS_WEI = (GAS_UNITS * GAS_PRICE * 6n) / 5n;

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return createElement(QueryClientProvider, { client }, children);
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("useDepositEthAffordability", () => {
  it("does not read balance and reports unknown when disabled", () => {
    const { result } = renderHook(
      () =>
        useDepositEthAffordability({
          ethAddress: ETH_ADDRESS,
          vaultProvider: PROVIDER,
          batchSize: 1,
          feeWei: FEE_WEI,
          enabled: false,
        }),
      { wrapper },
    );

    expect(result.current.hasEnough).toBeNull();
    expect(mockGetBalance).not.toHaveBeenCalled();
  });

  it("does not read balance when feeWei is null (fee still loading)", () => {
    const { result } = renderHook(
      () =>
        useDepositEthAffordability({
          ethAddress: ETH_ADDRESS,
          vaultProvider: PROVIDER,
          batchSize: 1,
          feeWei: null,
          enabled: true,
        }),
      { wrapper },
    );

    expect(result.current.hasEnough).toBeNull();
    expect(mockGetBalance).not.toHaveBeenCalled();
  });

  it("has enough when balance covers fee + buffered gas", async () => {
    mockGetBalance.mockResolvedValue(FEE_WEI + BUFFERED_GAS_WEI + 1n);
    mockEstimateGas.mockResolvedValue(GAS_UNITS);
    mockGetGasPrice.mockResolvedValue(GAS_PRICE);

    const { result } = renderHook(
      () =>
        useDepositEthAffordability({
          ethAddress: ETH_ADDRESS,
          vaultProvider: PROVIDER,
          batchSize: 1,
          feeWei: FEE_WEI,
          enabled: true,
        }),
      { wrapper },
    );

    await waitFor(() => expect(result.current.hasEnough).toBe(true));
  });

  it("is short when balance covers fee but not the buffered gas on top", async () => {
    mockGetBalance.mockResolvedValue(FEE_WEI); // exactly the fee, no gas room
    mockEstimateGas.mockResolvedValue(GAS_UNITS);
    mockGetGasPrice.mockResolvedValue(GAS_PRICE);

    const { result } = renderHook(
      () =>
        useDepositEthAffordability({
          ethAddress: ETH_ADDRESS,
          vaultProvider: PROVIDER,
          batchSize: 1,
          feeWei: FEE_WEI,
          enabled: true,
        }),
      { wrapper },
    );

    await waitFor(() => expect(result.current.hasEnough).toBe(false));
  });

  it("blocks on the fee floor when the gas estimate fails and balance is below the fee", async () => {
    mockGetBalance.mockResolvedValue(FEE_WEI - 1n);
    mockEstimateGas.mockRejectedValue(new Error("execution reverted"));
    mockGetGasPrice.mockResolvedValue(GAS_PRICE);

    const { result } = renderHook(
      () =>
        useDepositEthAffordability({
          ethAddress: ETH_ADDRESS,
          vaultProvider: PROVIDER,
          batchSize: 1,
          feeWei: FEE_WEI,
          enabled: true,
        }),
      { wrapper },
    );

    // Gas unavailable -> required falls back to the fee-only floor, and a
    // balance below the fee is blocked.
    await waitFor(() => expect(result.current.hasEnough).toBe(false));
  });

  it("passes on the fee floor when the gas estimate fails but balance covers the fee", async () => {
    mockGetBalance.mockResolvedValue(FEE_WEI);
    mockEstimateGas.mockRejectedValue(new Error("execution reverted"));
    mockGetGasPrice.mockResolvedValue(GAS_PRICE);

    const { result } = renderHook(
      () =>
        useDepositEthAffordability({
          ethAddress: ETH_ADDRESS,
          vaultProvider: PROVIDER,
          batchSize: 1,
          feeWei: FEE_WEI,
          enabled: true,
        }),
      { wrapper },
    );

    await waitFor(() => expect(result.current.hasEnough).toBe(true));
  });

  it("reports error (fail-open: hasEnough null) when the balance read fails", async () => {
    mockGetBalance.mockRejectedValue(new Error("rpc down"));
    mockEstimateGas.mockResolvedValue(GAS_UNITS);
    mockGetGasPrice.mockResolvedValue(GAS_PRICE);

    const { result } = renderHook(
      () =>
        useDepositEthAffordability({
          ethAddress: ETH_ADDRESS,
          vaultProvider: PROVIDER,
          batchSize: 1,
          feeWei: FEE_WEI,
          enabled: true,
        }),
      { wrapper },
    );

    // retry: 1 (matching useDepositPeginFee) adds a ~1s backoff before the
    // query settles to error, so allow more than waitFor's 1s default.
    await waitFor(() => expect(result.current.isError).toBe(true), {
      timeout: 3000,
    });
    expect(result.current.hasEnough).toBeNull();
  });
});
