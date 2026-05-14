/**
 * Tests for useReorderVaults — verifies the on-chain integrity guards run
 * before the wallet prompt fires.
 */

import { act, renderHook } from "@testing-library/react";
import type { Hex } from "viem";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/config/env", () => ({
  ENV: {
    BTC_VAULT_REGISTRY: "0x1234567890123456789012345678901234567890",
    AAVE_ADAPTER: "0xaaaa000000000000000000000000000000000ada",
    GRAPHQL_ENDPOINT: "https://test.example.com/graphql",
  },
}));

vi.mock("@/config/network", () => ({
  getETHChain: vi.fn(() => ({ id: 11155111, name: "Sepolia" })),
  getNetworkConfigETH: vi.fn(() => ({ chainId: 11155111, name: "sepolia" })),
  getNetworkConfigBTC: vi.fn(() => ({
    network: "signet",
    mempoolApiUrl: "https://mempool.space/signet/api",
  })),
}));

vi.mock("@/infrastructure", () => ({
  logger: { error: vi.fn() },
}));

const mockHandleError = vi.fn();
vi.mock("@/context/error", () => ({
  useError: () => ({ handleError: mockHandleError }),
}));

const mockUseAccount = vi.fn();
const mockUseWalletClient = vi.fn();
vi.mock("wagmi", () => ({
  useAccount: () => mockUseAccount(),
  useWalletClient: () => mockUseWalletClient(),
}));

const mockGetAaveAdapterAddress = vi.fn(
  () => "0xaaaa000000000000000000000000000000000ada",
);
vi.mock("../../config", () => ({
  getAaveAdapterAddress: () => mockGetAaveAdapterAddress(),
}));

const mockAssertMembership = vi.fn();
const mockAssertSuggestedOrder = vi.fn();
const mockReorderVaultOrder = vi.fn();
vi.mock("../../services", () => ({
  assertReorderMembership: (...args: unknown[]) =>
    mockAssertMembership(...args),
  assertSuggestedOrderMatchesOnChain: (...args: unknown[]) =>
    mockAssertSuggestedOrder(...args),
  reorderVaultOrder: (...args: unknown[]) => mockReorderVaultOrder(...args),
}));

import type { ReorderVerificationContext } from "../../services";
import { useReorderVaults } from "../useReorderVaults";

const USER = "0x000000000000000000000000000000000000beef" as const;
const VAULT_A =
  "0xaaaa000000000000000000000000000000000000000000000000000000000001" as Hex;
const VAULT_B =
  "0xbbbb000000000000000000000000000000000000000000000000000000000002" as Hex;

const CTX: ReorderVerificationContext = {
  CF: 0.7,
  THF: 1.1,
  maxLB: 1.05,
  btcPrice: 60_000,
  totalDebtUsd: 10_000,
};

function setupConnectedWallet() {
  mockUseAccount.mockReturnValue({ address: USER });
  mockUseWalletClient.mockReturnValue({
    data: { account: { address: USER }, chain: { id: 11155111 } },
  });
}

describe("useReorderVaults — on-chain integrity guards", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupConnectedWallet();
    // Guard A now returns the on-chain ordering so Guard B can feed it
    // into calculate(...). Default mock returns the same IDs the test
    // submits — individual tests can override.
    mockAssertMembership.mockResolvedValue([VAULT_A, VAULT_B]);
    mockAssertSuggestedOrder.mockResolvedValue(undefined);
    mockReorderVaultOrder.mockResolvedValue({
      transactionHash: "0xtx",
    });
  });

  it("calls assertReorderMembership with the env-pinned adapter address before broadcasting", async () => {
    const { result } = renderHook(() => useReorderVaults());

    await act(async () => {
      await result.current.executeReorder([VAULT_A, VAULT_B]);
    });

    expect(mockAssertMembership).toHaveBeenCalledTimes(1);
    expect(mockAssertMembership.mock.calls[0][0]).toBe(
      "0xaaaa000000000000000000000000000000000ada",
    );
    expect(mockAssertMembership.mock.calls[0][1]).toBe(USER);
    expect(mockAssertMembership.mock.calls[0][2]).toEqual([VAULT_A, VAULT_B]);
    expect(mockReorderVaultOrder).toHaveBeenCalledTimes(1);
  });

  it("blocks the reorder tx and surfaces the error when membership fails", async () => {
    mockAssertMembership.mockRejectedValue(new Error("multiset mismatch"));

    const { result } = renderHook(() => useReorderVaults());

    let resolved: boolean | undefined;
    await act(async () => {
      resolved = await result.current.executeReorder([VAULT_A, VAULT_B]);
    });

    expect(resolved).toBe(false);
    expect(mockReorderVaultOrder).not.toHaveBeenCalled();
    expect(mockHandleError).toHaveBeenCalled();
  });

  it("runs the optimal-order recompute only when suggestedOrderContext is provided", async () => {
    const { result } = renderHook(() => useReorderVaults());

    await act(async () => {
      await result.current.executeReorder([VAULT_A, VAULT_B]);
    });

    expect(mockAssertSuggestedOrder).not.toHaveBeenCalled();
    expect(mockReorderVaultOrder).toHaveBeenCalledTimes(1);
  });

  it("forwards the on-chain ordering and env-pinned adapter into the recompute when context is provided", async () => {
    // Guard A returns the current on-chain order. Submitted order is
    // [B, A] (a permutation). Guard B receives both.
    mockAssertMembership.mockResolvedValue([VAULT_A, VAULT_B]);

    const { result } = renderHook(() => useReorderVaults());

    await act(async () => {
      await result.current.executeReorder([VAULT_B, VAULT_A], {
        suggestedOrderContext: CTX,
      });
    });

    expect(mockAssertSuggestedOrder).toHaveBeenCalledWith(
      [VAULT_B, VAULT_A],
      [VAULT_A, VAULT_B],
      "0xaaaa000000000000000000000000000000000ada",
      CTX,
    );
    expect(mockReorderVaultOrder).toHaveBeenCalledTimes(1);
  });

  it("blocks the reorder tx when the optimal-order recompute rejects", async () => {
    mockAssertSuggestedOrder.mockRejectedValue(new Error("order mismatch"));

    const { result } = renderHook(() => useReorderVaults());

    let resolved: boolean | undefined;
    await act(async () => {
      resolved = await result.current.executeReorder([VAULT_A, VAULT_B], {
        suggestedOrderContext: CTX,
      });
    });

    expect(resolved).toBe(false);
    expect(mockReorderVaultOrder).not.toHaveBeenCalled();
    expect(mockHandleError).toHaveBeenCalled();
  });

  it("rejects when the wallet is not connected (before any on-chain read)", async () => {
    mockUseAccount.mockReturnValue({ address: undefined });
    mockUseWalletClient.mockReturnValue({ data: undefined });

    const { result } = renderHook(() => useReorderVaults());

    let resolved: boolean | undefined;
    await act(async () => {
      resolved = await result.current.executeReorder([VAULT_A]);
    });

    expect(resolved).toBe(false);
    expect(mockAssertMembership).not.toHaveBeenCalled();
    expect(mockReorderVaultOrder).not.toHaveBeenCalled();
  });
});
