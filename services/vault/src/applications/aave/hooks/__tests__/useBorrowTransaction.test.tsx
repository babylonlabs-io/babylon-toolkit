import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockBorrow = vi.fn();
const mockAssertReserve = vi.fn();
const mockGetERC20Decimals = vi.hoisted(() => vi.fn());
const mockInvalidateQueries = vi.hoisted(() => vi.fn());
vi.mock("../../services", () => ({
  borrow: (...a: unknown[]) => mockBorrow(...a),
  assertReserveMatchesOnChain: (...a: unknown[]) => mockAssertReserve(...a),
  ReserveMismatchError: class ReserveMismatchError extends Error {},
}));

vi.mock("../../config", () => ({
  getAaveAdapterAddress: () => "0xadapter",
}));

vi.mock("@/clients/eth-contract", () => ({
  ERC20: { getERC20Decimals: mockGetERC20Decimals },
}));

vi.mock("@/infrastructure", () => ({
  logger: { error: vi.fn() },
}));

vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ invalidateQueries: mockInvalidateQueries }),
}));

vi.mock("wagmi", () => ({
  useWalletClient: () => ({ data: { account: { address: "0xuser" } } }),
  useAccount: () => ({ address: "0xuser" }),
}));

// Local override of the global gate mock so we can drive a paused aave scope.
const gateMock = vi.hoisted(() => ({
  value: { protocol: null as string | null, aave: null as string | null },
}));
vi.mock("@/hooks/useProtocolGate", () => ({
  useProtocolGateState: () => gateMock.value,
}));

import { ContractError, ErrorCode } from "@/utils/errors";

import { useBorrowTransaction } from "../useBorrowTransaction";

const RESERVE = {} as never;
const LIVE_RESERVE = {
  reserveId: "r1",
  token: { address: "0xtoken", decimals: 6, symbol: "USDC" },
} as never;

beforeEach(() => {
  vi.clearAllMocks();
  gateMock.value = { protocol: null, aave: null };
});

describe("useBorrowTransaction — pause gating", () => {
  it("refuses to broadcast when an aave Freeze/Pause blocks borrow (before any on-chain read)", async () => {
    gateMock.value = { protocol: null, aave: "paused" };
    const { result } = renderHook(() => useBorrowTransaction());

    let resolved: boolean | undefined;
    await act(async () => {
      resolved = await result.current.executeBorrow(100, RESERVE);
    });

    expect(resolved).toBe(false);
    expect(mockAssertReserve).not.toHaveBeenCalled();
    expect(mockBorrow).not.toHaveBeenCalled();
  });
});

describe("useBorrowTransaction — cache invalidation", () => {
  it("invalidates the vault, position and hub queries by key prefix after a borrow", async () => {
    mockAssertReserve.mockResolvedValue(undefined);
    mockGetERC20Decimals.mockResolvedValue(6);
    mockBorrow.mockResolvedValue({ transactionHash: "0xhash" });
    const { result } = renderHook(() => useBorrowTransaction());

    let resolved: boolean | undefined;
    await act(async () => {
      resolved = await result.current.executeBorrow(100, LIVE_RESERVE);
    });

    expect(resolved).toBe(true);
    expect(
      mockInvalidateQueries.mock.calls.map((call) => call[0].queryKey),
    ).toEqual([
      ["vaults"],
      ["aaveUserPosition"],
      ["aaveReserveLiquidity"],
      ["aaveReserveDrawHeadroom"],
      ["aaveHubSpokeConfigs"],
    ]);
  });
});

describe("useBorrowTransaction — hub reverts", () => {
  it("shows a draw-cap revert scaled and named for the reserve, not the generic rewrite", async () => {
    mockAssertReserve.mockResolvedValue(undefined);
    mockGetERC20Decimals.mockResolvedValue(6);
    mockBorrow.mockRejectedValue(
      new ContractError(
        "This market has reached its borrow limit on its hub.",
        ErrorCode.CONTRACT_REVERT,
        undefined,
        "DrawCapExceeded",
        { context: { errorArgs: [1_000_000n] } },
      ),
    );
    const { result } = renderHook(() => useBorrowTransaction());

    await act(async () => {
      await result.current.executeBorrow(100, {
        reserveId: 4n,
        // Vault Devnet Core Hub, in the hub registry.
        reserve: {
          hub: "0xF5E52D571Ed9b4779399A815815ABeFF7D7ec4ca",
          decimals: 6,
        },
        token: { address: "0xtoken", decimals: 6, symbol: "USDC" },
      } as never);
    });

    expect(result.current.error).toBe(
      "This amount would go over the borrow limit for USDC on Core Hub, which is 1,000,000 USDC. Enter a lower amount and try again.",
    );
  });
});
