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

const mockAssertNoTransactionInFlight = vi.hoisted(() => vi.fn());
vi.mock("@/clients/eth-contract/transactionInFlight", () => ({
  assertNoTransactionInFlight: (...a: unknown[]) =>
    mockAssertNoTransactionInFlight(...a),
}));

vi.mock("@/clients/eth-contract/client", () => ({
  ethClient: {
    getPublicClient: () => ({
      getTransaction: () => Promise.reject(new Error("not found")),
    }),
  },
}));

vi.mock("@/infrastructure", () => ({
  logger: { error: vi.fn() },
}));

const mockInvalidateQueries = vi.hoisted(() => vi.fn());
vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ invalidateQueries: mockInvalidateQueries }),
}));

const mockUseAccount = vi.fn();
const mockUseWalletClient = vi.fn();
vi.mock("wagmi", () => ({
  useAccount: () => mockUseAccount(),
  useWalletClient: () => mockUseWalletClient(),
}));

const mockIsReorderBlocked = vi.fn(() => false);
vi.mock("@/components/shared/protocolStatus", () => ({
  isReorderBlocked: () => mockIsReorderBlocked(),
}));

const mockGetAaveAdapterAddress = vi.fn(
  () => "0xaaaa000000000000000000000000000000000ada",
);
vi.mock("../../config", () => ({
  getAaveAdapterAddress: () => mockGetAaveAdapterAddress(),
}));

const mockAssertMembership = vi.fn();
const mockAssertBaseline = vi.fn();
const mockAssertOptimalOrder = vi.fn();
const mockAssertCollateralAmounts = vi.fn();
const mockReorderVaultOrder = vi.fn();

const {
  FakePositionChangedError,
  FakeCollateralAmountMismatchError,
  FakeCollateralRegistryReadError,
} = vi.hoisted(() => {
  class FakePositionChangedError extends Error {
    readonly code = "POSITION_CHANGED_REFRESH_REQUIRED";
  }
  class FakeCollateralAmountMismatchError extends Error {
    readonly code = "COLLATERAL_AMOUNT_MISMATCH";
  }
  class FakeCollateralRegistryReadError extends Error {
    readonly code = "COLLATERAL_REGISTRY_READ_FAILED";
  }
  return {
    FakePositionChangedError,
    FakeCollateralAmountMismatchError,
    FakeCollateralRegistryReadError,
  };
});

vi.mock("../../services", () => ({
  PositionChangedError: FakePositionChangedError,
  CollateralAmountMismatchError: FakeCollateralAmountMismatchError,
  CollateralRegistryReadError: FakeCollateralRegistryReadError,
  assertReorderMembership: (...args: unknown[]) =>
    mockAssertMembership(...args),
  assertReorderBaseline: (...args: unknown[]) => mockAssertBaseline(...args),
  assertOptimalOrderMatchesOnChain: (...args: unknown[]) =>
    mockAssertOptimalOrder(...args),
  assertCollateralAmountsMatchOnChain: (...args: unknown[]) =>
    mockAssertCollateralAmounts(...args),
  reorderVaultOrder: (...args: unknown[]) => mockReorderVaultOrder(...args),
}));

import { COPY } from "@/copy";
import {
  SendOutcomeUnknownError,
  TransactionInFlightError,
  TransactionReplacedError,
} from "@/utils/errors";

import type { ReorderVerificationContext } from "../../services";
import {
  useReorderVaults,
  type ExecuteReorderOptions,
} from "../useReorderVaults";

const USER = "0x000000000000000000000000000000000000beef" as const;
const VAULT_A =
  "0xaaaa000000000000000000000000000000000000000000000000000000000001" as Hex;
const VAULT_B =
  "0xbbbb000000000000000000000000000000000000000000000000000000000002" as Hex;

const CTX: ReorderVerificationContext = {
  CF: 0.7,
  THF: 1.1,
  LB: 1.05,
  expectedHF: 0.95,
  minPeginBtc: 0.0005,
  btcPrice: 60_000,
  totalDebtUsd: 10_000,
};

/** The vaults and amounts the modal showed, in the on-chain order at open. */
const REVIEWED_VAULTS = [
  { vaultId: VAULT_A, amountSats: 60_000_000n },
  { vaultId: VAULT_B, amountSats: 20_000_000n },
];

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
    mockIsReorderBlocked.mockReturnValue(false);
    // Guard A now returns the on-chain ordering so Guard B can feed it
    // into calculate(...). Default mock returns the same IDs the test
    // submits — individual tests can override.
    mockAssertMembership.mockResolvedValue([VAULT_A, VAULT_B]);
    mockAssertBaseline.mockReturnValue(undefined);
    mockAssertOptimalOrder.mockResolvedValue(undefined);
    mockAssertCollateralAmounts.mockResolvedValue(undefined);
    mockReorderVaultOrder.mockResolvedValue({
      transactionHash: "0xtx",
    });
    mockAssertNoTransactionInFlight.mockResolvedValue(undefined);
  });

  it("refuses before the membership read while the wallet has a pending transaction", async () => {
    mockAssertNoTransactionInFlight.mockRejectedValue(
      new TransactionInFlightError(),
    );
    const { result } = renderHook(() => useReorderVaults());

    let resolved: boolean | undefined;
    await act(async () => {
      resolved = await result.current.executeReorder([VAULT_A, VAULT_B], {
        kind: "baseline",
        expectedCurrentVaultIds: [VAULT_A, VAULT_B],
      });
    });

    expect(resolved).toBe(false);
    expect(result.current.notice).toBe(COPY.common.transactionInFlight);
    expect(result.current.error).toBeNull();
    expect(mockAssertMembership).not.toHaveBeenCalled();
    expect(mockReorderVaultOrder).not.toHaveBeenCalled();
  });

  it("refreshes the position when the wallet replaced the reorder, which a speed-up may have done anyway", async () => {
    mockReorderVaultOrder.mockRejectedValue(
      new TransactionReplacedError(
        "unknown",
        "0x5555555555555555555555555555555555555555555555555555555555555555",
      ),
    );
    const { result } = renderHook(() => useReorderVaults());

    let resolved: boolean | undefined;
    await act(async () => {
      resolved = await result.current.executeReorder([VAULT_A, VAULT_B], {
        kind: "baseline",
        expectedCurrentVaultIds: [VAULT_A, VAULT_B],
      });
    });

    expect(resolved).toBe(false);
    expect(result.current.notice).toBe(
      COPY.common.unconfirmedTransaction.replacedOutcomeUnknown,
    );
    expect(
      mockInvalidateQueries.mock.calls.map((call) => call[0].queryKey),
    ).toContainEqual(["aaveUserPosition"]);
  });

  it('refreshes the position when the wallet refused as "nonce too low" a reorder it may have broadcast', async () => {
    mockReorderVaultOrder.mockRejectedValue(
      new SendOutcomeUnknownError(
        new Error("nonce too low: next nonce 789, tx nonce 788"),
      ),
    );
    const { result } = renderHook(() => useReorderVaults());

    let resolved: boolean | undefined;
    await act(async () => {
      resolved = await result.current.executeReorder([VAULT_A, VAULT_B], {
        kind: "baseline",
        expectedCurrentVaultIds: [VAULT_A, VAULT_B],
      });
    });

    expect(resolved).toBe(false);
    expect(result.current.notice).toBe(
      COPY.common.classifiedErrors.sendOutcomeUnknown,
    );
    expect(
      mockInvalidateQueries.mock.calls.map((call) => call[0].queryKey),
    ).toContainEqual(["aaveUserPosition"]);
  });

  it("calls assertReorderMembership with the env-pinned adapter address before broadcasting", async () => {
    const { result } = renderHook(() => useReorderVaults());

    await act(async () => {
      await result.current.executeReorder([VAULT_A, VAULT_B], {
        kind: "baseline",
        expectedCurrentVaultIds: [VAULT_A, VAULT_B],
      });
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
      resolved = await result.current.executeReorder([VAULT_A, VAULT_B], {
        kind: "baseline",
        expectedCurrentVaultIds: [VAULT_A, VAULT_B],
      });
    });

    expect(resolved).toBe(false);
    expect(mockReorderVaultOrder).not.toHaveBeenCalled();
    expect(result.current.error).not.toBeNull();
  });

  it("refuses to broadcast when Freeze/Pause blocks reorder (before any on-chain read)", async () => {
    mockIsReorderBlocked.mockReturnValue(true);

    const { result } = renderHook(() => useReorderVaults());

    let resolved: boolean | undefined;
    await act(async () => {
      resolved = await result.current.executeReorder([VAULT_A, VAULT_B], {
        kind: "baseline",
        expectedCurrentVaultIds: [VAULT_A, VAULT_B],
      });
    });

    expect(resolved).toBe(false);
    expect(mockAssertMembership).not.toHaveBeenCalled();
    expect(mockReorderVaultOrder).not.toHaveBeenCalled();
    expect(result.current.error).toBeNull();
  });

  it("runs the optimal-order recompute only on the optimal variant", async () => {
    const { result } = renderHook(() => useReorderVaults());

    await act(async () => {
      await result.current.executeReorder([VAULT_A, VAULT_B], {
        kind: "baseline",
        expectedCurrentVaultIds: [VAULT_A, VAULT_B],
      });
    });

    expect(mockAssertOptimalOrder).not.toHaveBeenCalled();
    expect(mockReorderVaultOrder).toHaveBeenCalledTimes(1);
  });

  it("forwards the on-chain ordering and env-pinned adapter into the recompute on the optimal variant", async () => {
    // Guard A returns the current on-chain order. Submitted order is
    // [B, A] (a permutation). Guard B receives both.
    mockAssertMembership.mockResolvedValue([VAULT_A, VAULT_B]);

    const { result } = renderHook(() => useReorderVaults());

    await act(async () => {
      await result.current.executeReorder([VAULT_B, VAULT_A], {
        kind: "optimal",
        optimalOrderContext: CTX,
      });
    });

    expect(mockAssertOptimalOrder).toHaveBeenCalledWith(
      [VAULT_B, VAULT_A],
      [VAULT_A, VAULT_B],
      "0xaaaa000000000000000000000000000000000ada",
      CTX,
    );
    expect(mockReorderVaultOrder).toHaveBeenCalledTimes(1);
  });

  it("blocks the reorder tx when the optimal-order recompute rejects", async () => {
    mockAssertOptimalOrder.mockRejectedValue(new Error("order mismatch"));

    const { result } = renderHook(() => useReorderVaults());

    let resolved: boolean | undefined;
    await act(async () => {
      resolved = await result.current.executeReorder([VAULT_A, VAULT_B], {
        kind: "optimal",
        optimalOrderContext: CTX,
      });
    });

    expect(resolved).toBe(false);
    expect(mockReorderVaultOrder).not.toHaveBeenCalled();
    expect(result.current.error).not.toBeNull();
  });

  it("rejects when the wallet is not connected (before any on-chain read)", async () => {
    mockUseAccount.mockReturnValue({ address: undefined });
    mockUseWalletClient.mockReturnValue({ data: undefined });

    const { result } = renderHook(() => useReorderVaults());

    let resolved: boolean | undefined;
    await act(async () => {
      resolved = await result.current.executeReorder([VAULT_A], {
        kind: "baseline",
        expectedCurrentVaultIds: [VAULT_A],
      });
    });

    expect(resolved).toBe(false);
    expect(mockAssertMembership).not.toHaveBeenCalled();
    expect(mockReorderVaultOrder).not.toHaveBeenCalled();
  });

  it("forwards Guard A's live ordering into the baseline check on the baseline variant", async () => {
    mockAssertMembership.mockResolvedValue([VAULT_A, VAULT_B]);

    const { result } = renderHook(() => useReorderVaults());

    await act(async () => {
      await result.current.executeReorder([VAULT_B, VAULT_A], {
        kind: "baseline",
        expectedCurrentVaultIds: [VAULT_A, VAULT_B],
      });
    });

    expect(mockAssertBaseline).toHaveBeenCalledTimes(1);
    expect(mockAssertBaseline).toHaveBeenCalledWith(
      [VAULT_A, VAULT_B],
      [VAULT_A, VAULT_B],
    );
    expect(mockReorderVaultOrder).toHaveBeenCalledTimes(1);
  });

  it("does not call the baseline or amount checks on the banner CTA path (optimal variant)", async () => {
    const { result } = renderHook(() => useReorderVaults());

    await act(async () => {
      await result.current.executeReorder([VAULT_A, VAULT_B], {
        kind: "optimal",
        optimalOrderContext: CTX,
      });
    });

    expect(mockAssertBaseline).not.toHaveBeenCalled();
    expect(mockAssertCollateralAmounts).not.toHaveBeenCalled();
    expect(mockReorderVaultOrder).toHaveBeenCalledTimes(1);
  });

  it("blocks the reorder tx and surfaces PositionChangedError unwrapped when the baseline differs", async () => {
    const positionChangedError = new FakePositionChangedError(
      "collateral order changed",
    );
    mockAssertBaseline.mockImplementation(() => {
      throw positionChangedError;
    });

    const { result } = renderHook(() => useReorderVaults());

    let resolved: boolean | undefined;
    await act(async () => {
      resolved = await result.current.executeReorder([VAULT_B, VAULT_A], {
        kind: "baseline",
        expectedCurrentVaultIds: [VAULT_A, VAULT_B],
      });
    });

    expect(resolved).toBe(false);
    expect(mockReorderVaultOrder).not.toHaveBeenCalled();
    expect(result.current.error).toBe(positionChangedError.message);
  });

  it("manual variant: runs the baseline check with the reviewed vault IDs and the amount guard with the reviewed pairs and the env-pinned adapter", async () => {
    mockAssertMembership.mockResolvedValue([VAULT_A, VAULT_B]);

    const { result } = renderHook(() => useReorderVaults());

    await act(async () => {
      await result.current.executeReorder([VAULT_B, VAULT_A], {
        kind: "manual",
        expectedCurrentVaults: REVIEWED_VAULTS,
      });
    });

    expect(mockAssertBaseline).toHaveBeenCalledWith(
      [VAULT_A, VAULT_B],
      [VAULT_A, VAULT_B],
    );
    expect(mockAssertCollateralAmounts).toHaveBeenCalledWith(
      REVIEWED_VAULTS,
      "0xaaaa000000000000000000000000000000000ada",
    );
    expect(mockReorderVaultOrder).toHaveBeenCalledTimes(1);
  });

  it("manual variant: checks the baseline before reading the registry amounts", async () => {
    const { result } = renderHook(() => useReorderVaults());

    await act(async () => {
      await result.current.executeReorder([VAULT_B, VAULT_A], {
        kind: "manual",
        expectedCurrentVaults: REVIEWED_VAULTS,
      });
    });

    expect(mockAssertBaseline.mock.invocationCallOrder[0]).toBeLessThan(
      mockAssertCollateralAmounts.mock.invocationCallOrder[0],
    );
  });

  it("manual variant: blocks the reorder tx and surfaces the amount-mismatch copy when a reviewed amount differs from the registry", async () => {
    mockAssertCollateralAmounts.mockRejectedValue(
      new FakeCollateralAmountMismatchError("amount mismatch"),
    );

    const { result } = renderHook(() => useReorderVaults());

    let resolved: boolean | undefined;
    await act(async () => {
      resolved = await result.current.executeReorder([VAULT_B, VAULT_A], {
        kind: "manual",
        expectedCurrentVaults: REVIEWED_VAULTS,
      });
    });

    expect(resolved).toBe(false);
    expect(mockReorderVaultOrder).not.toHaveBeenCalled();
    expect(result.current.error).toBe(COPY.reorder.collateralAmountsChanged);
  });

  it("manual variant: blocks the reorder tx and surfaces the could-not-verify copy, not the mismatch copy, when the registry read fails", async () => {
    mockAssertCollateralAmounts.mockRejectedValue(
      new FakeCollateralRegistryReadError("rpc timeout"),
    );

    const { result } = renderHook(() => useReorderVaults());

    let resolved: boolean | undefined;
    await act(async () => {
      resolved = await result.current.executeReorder([VAULT_B, VAULT_A], {
        kind: "manual",
        expectedCurrentVaults: REVIEWED_VAULTS,
      });
    });

    expect(resolved).toBe(false);
    expect(mockReorderVaultOrder).not.toHaveBeenCalled();
    expect(result.current.error).toBe(
      COPY.reorder.collateralVerificationFailed,
    );
  });

  it("refuses to sign when the options carry a kind with no guards", async () => {
    const { result } = renderHook(() => useReorderVaults());

    let resolved: boolean | undefined;
    await act(async () => {
      resolved = await result.current.executeReorder([VAULT_A, VAULT_B], {
        kind: "unknown",
      } as unknown as ExecuteReorderOptions);
    });

    expect(resolved).toBe(false);
    expect(mockReorderVaultOrder).not.toHaveBeenCalled();
    expect(result.current.error).not.toBeNull();
  });

  it("baseline variant: never runs the amount guard", async () => {
    const { result } = renderHook(() => useReorderVaults());

    await act(async () => {
      await result.current.executeReorder([VAULT_B, VAULT_A], {
        kind: "baseline",
        expectedCurrentVaultIds: [VAULT_A, VAULT_B],
      });
    });

    expect(mockAssertCollateralAmounts).not.toHaveBeenCalled();
    expect(mockReorderVaultOrder).toHaveBeenCalledTimes(1);
  });
});
