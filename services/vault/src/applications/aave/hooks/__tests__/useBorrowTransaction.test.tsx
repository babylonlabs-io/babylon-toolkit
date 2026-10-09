import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockBorrow = vi.fn();
const mockAssertReserve = vi.fn();
const mockGetERC20Decimals = vi.hoisted(() => vi.fn());
const mockInvalidateQueries = vi.hoisted(() => vi.fn());
const mockAssertNoTransactionInFlight = vi.hoisted(() => vi.fn());
const mockWaitReceipt = vi.hoisted(() => vi.fn());
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

// The app's RPC never serves the sent hash, as for a Safe proposal, so the
// wait relies on the receipt alone.
vi.mock("@/clients/eth-contract/client", () => ({
  ethClient: {
    getPublicClient: () => ({
      getTransaction: () => Promise.reject(new Error("not found")),
    }),
  },
}));

vi.mock("@/clients/eth-contract/transactionInFlight", () => ({
  assertNoTransactionInFlight: (...a: unknown[]) =>
    mockAssertNoTransactionInFlight(...a),
}));

// The receipt wait the app-wide lock resumes for an unconfirmed borrow.
vi.mock("@babylonlabs-io/ts-sdk/tbv/core/utils", () => ({
  waitForTransactionReceiptSmartAware: (...a: unknown[]) =>
    mockWaitReceipt(...a),
}));

vi.mock("@/infrastructure", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), event: vi.fn() },
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

import { COPY } from "@/copy";
import {
  ContractError,
  ErrorCode,
  TransactionInFlightError,
  TransactionReplacedError,
  UnconfirmedTransactionError,
} from "@/utils/errors";

import { STOP_WAITING_AVAILABLE_AFTER_MS } from "../../constants";
import { BorrowReserveCapUnavailableError } from "../../utils/borrowReserveLimit";
import { useBorrowTransaction } from "../useBorrowTransaction";

const RESERVE = {} as never;
const LIVE_RESERVE = {
  reserveId: "r1",
  token: { address: "0xtoken", decimals: 6, symbol: "USDC" },
} as never;

const HASH =
  "0x5555555555555555555555555555555555555555555555555555555555555555";

/** The borrow was broadcast, but its receipt wait timed out. */
function unconfirmedBorrow(): UnconfirmedTransactionError {
  return new UnconfirmedTransactionError(
    new ContractError("borrow from Aave Core position failed: timed out"),
    {
      hash: HASH,
      from: "0xuser" as `0x${string}`,
      to: "0xadapter" as `0x${string}`,
      data: "0x",
      nonce: null,
      sentAtBlock: null,
    },
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  gateMock.value = { protocol: null, aave: null };
  mockAssertNoTransactionInFlight.mockResolvedValue(undefined);
  mockAssertReserve.mockResolvedValue(undefined);
  mockGetERC20Decimals.mockResolvedValue(6);
});

describe("useBorrowTransaction — pause gating", () => {
  it("refuses to broadcast when an aave Freeze/Pause blocks borrow (before any on-chain read)", async () => {
    gateMock.value = { protocol: null, aave: "paused" };
    const { result } = renderHook(() => useBorrowTransaction());

    let resolved: string | undefined;
    await act(async () => {
      resolved = await result.current.executeBorrow(100, RESERVE);
    });

    expect(resolved).toBe("failed");
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

    let resolved: string | undefined;
    await act(async () => {
      resolved = await result.current.executeBorrow(100, LIVE_RESERVE);
    });

    expect(resolved).toBe("succeeded");
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

describe("useBorrowTransaction — unreadable borrow cap", () => {
  it("shows the cap-unavailable sentence as is, with no Borrow failed prefix", async () => {
    mockAssertReserve.mockResolvedValue(undefined);
    mockGetERC20Decimals.mockResolvedValue(6);
    const { result } = renderHook(() => useBorrowTransaction());

    await act(async () => {
      await result.current.executeBorrow(100, LIVE_RESERVE, async () => {
        throw new BorrowReserveCapUnavailableError({
          cause: new Error("RPC unavailable"),
        });
      });
    });

    expect(result.current.error).toBe(
      COPY.loans.borrowLimit.capUnavailableError,
    );
    expect(mockBorrow).not.toHaveBeenCalled();
  });
});

describe("useBorrowTransaction — a transaction already in flight", () => {
  it("refuses before any on-chain read while the wallet has a pending transaction", async () => {
    mockAssertNoTransactionInFlight.mockRejectedValue(
      new TransactionInFlightError(),
    );
    const { result } = renderHook(() => useBorrowTransaction());

    let resolved: string | undefined;
    await act(async () => {
      resolved = await result.current.executeBorrow(100, LIVE_RESERVE);
    });

    expect(resolved).toBe("failed");
    expect(result.current.notice).toBe(COPY.common.transactionInFlight);
    expect(result.current.error).toBeNull();
    expect(mockAssertReserve).not.toHaveBeenCalled();
    expect(mockBorrow).not.toHaveBeenCalled();
  });
});

describe("useBorrowTransaction — unconfirmed broadcast", () => {
  it("keeps waiting on a borrow whose receipt wait timed out and succeeds once it is mined", async () => {
    let mine!: (receipt: unknown) => void;
    mockWaitReceipt.mockReturnValue(
      new Promise((resolve) => {
        mine = resolve;
      }),
    );
    mockBorrow.mockRejectedValue(unconfirmedBorrow());
    const { result } = renderHook(() => useBorrowTransaction());

    let borrowing!: Promise<string>;
    await act(async () => {
      borrowing = result.current.executeBorrow(100, LIVE_RESERVE);
    });

    expect(result.current.pendingWrite).toEqual({
      phase: "unconfirmed",
      hash: HASH,
      stopWaiting: null,
    });
    expect(result.current.isProcessing).toBe(true);
    expect(result.current.error).toBeNull();

    await act(async () => {
      mine({ status: "success", transactionHash: HASH, from: "0xuser" });
      await expect(borrowing).resolves.toBe("succeeded");
    });
    expect(result.current.pendingWrite).toBeNull();
    expect(mockInvalidateQueries).toHaveBeenCalled();
  });

  it("refuses a borrow from a remounted form while the first one is still unconfirmed", async () => {
    let mine!: (receipt: unknown) => void;
    mockWaitReceipt.mockReturnValue(
      new Promise((resolve) => {
        mine = resolve;
      }),
    );
    mockBorrow.mockRejectedValue(unconfirmedBorrow());
    const first = renderHook(() => useBorrowTransaction());
    let borrowing!: Promise<string>;
    await act(async () => {
      borrowing = first.result.current.executeBorrow(100, LIVE_RESERVE);
    });
    first.unmount();

    const { result } = renderHook(() => useBorrowTransaction());
    let resolved: string | undefined;
    await act(async () => {
      resolved = await result.current.executeBorrow(100, LIVE_RESERVE);
    });

    expect(resolved).toBe("failed");
    expect(result.current.notice).toBe(
      COPY.common.unconfirmedTransaction.inProgress,
    );
    expect(mockBorrow).toHaveBeenCalledTimes(1);

    await act(async () => {
      mine({ status: "success", transactionHash: HASH, from: "0xuser" });
      await borrowing;
    });
  });

  it("tells another form why it is locked while this borrow is still being submitted", async () => {
    let send!: (value: unknown) => void;
    mockBorrow.mockReturnValue(
      new Promise((resolve) => {
        send = resolve;
      }),
    );
    const borrowForm = renderHook(() => useBorrowTransaction());
    const otherForm = renderHook(() => useBorrowTransaction());
    let borrowing!: Promise<string>;
    await act(async () => {
      borrowing = borrowForm.result.current.executeBorrow(100, LIVE_RESERVE);
    });

    expect(otherForm.result.current.pendingWrite).toEqual({
      phase: "submitting",
    });
    expect(otherForm.result.current.notice).toBe(
      COPY.common.unconfirmedTransaction.inProgress,
    );
    expect(borrowForm.result.current.notice).toBeNull();

    await act(async () => {
      send({ transactionHash: HASH });
      await borrowing;
    });
    expect(otherForm.result.current.notice).toBeNull();
  });

  it("reports a replacement it could not read as an unknown outcome, not a failure, and refreshes the position", async () => {
    mockBorrow.mockRejectedValue(new TransactionReplacedError("unknown", HASH));
    const { result } = renderHook(() => useBorrowTransaction());

    let resolved: string | undefined;
    await act(async () => {
      resolved = await result.current.executeBorrow(100, LIVE_RESERVE);
    });

    expect(resolved).toBe("unknown");
    expect(result.current.notice).toBe(
      COPY.common.unconfirmedTransaction.replacedOutcomeUnknown,
    );
    expect(result.current.error).toBeNull();
    expect(
      mockInvalidateQueries.mock.calls.map((call) => call[0].queryKey),
    ).toContainEqual(["aaveUserPosition"]);
  });

  it("fails with the reverted copy when the late borrow is mined but reverted", async () => {
    mockWaitReceipt.mockResolvedValue({
      status: "reverted",
      transactionHash: HASH,
      from: "0xuser",
    });
    mockBorrow.mockRejectedValue(unconfirmedBorrow());
    const { result } = renderHook(() => useBorrowTransaction());

    let resolved: string | undefined;
    await act(async () => {
      resolved = await result.current.executeBorrow(100, LIVE_RESERVE);
    });

    expect(resolved).toBe("failed");
    expect(result.current.error).toBe(
      COPY.common.unconfirmedTransaction.reverted,
    );
  });

  it("reports an unknown outcome without an error, and refreshes the position, when the user stops waiting", async () => {
    vi.useFakeTimers();
    try {
      // A receipt that never arrives, like a Safe proposal no one executes.
      mockWaitReceipt.mockReturnValue(new Promise(() => {}));
      mockBorrow.mockRejectedValue(unconfirmedBorrow());
      const { result } = renderHook(() => useBorrowTransaction());

      let borrowing!: Promise<string>;
      await act(async () => {
        borrowing = result.current.executeBorrow(100, LIVE_RESERVE);
      });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(STOP_WAITING_AVAILABLE_AFTER_MS);
      });
      const pending = result.current.pendingWrite;
      if (pending?.phase !== "unconfirmed" || !pending.stopWaiting) {
        throw new Error("expected the stop-waiting action to be offered");
      }

      await act(async () => {
        pending.stopWaiting?.();
        await expect(borrowing).resolves.toBe("unknown");
      });
      expect(result.current.error).toBeNull();
      expect(result.current.pendingWrite).toBeNull();
      expect(mockInvalidateQueries).toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });
});
