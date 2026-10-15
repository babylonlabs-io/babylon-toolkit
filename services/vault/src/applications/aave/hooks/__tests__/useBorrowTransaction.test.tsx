import { act, renderHook, waitFor } from "@testing-library/react";
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

// A late receipt is taken as already deep enough on the chain; the depth
// check itself is covered by canonicalReceipt.test.ts.
vi.mock("@/clients/eth-contract/canonicalReceipt", () => ({
  waitForCanonicalReceipt: async ({ receipt }: { receipt: unknown }) => receipt,
}));

vi.mock("@/infrastructure", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), event: vi.fn() },
}));

vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ invalidateQueries: mockInvalidateQueries }),
}));

vi.mock("@/context/wallet", () => ({
  useETHWallet: () => ({ address: "0xuser" }),
}));

vi.mock("@/clients/eth-contract/walletChain", () => ({
  getWalletClientOnExpectedChain: vi
    .fn()
    .mockResolvedValue({ account: { address: "0xuser" } }),
}));

// Local override of the global gate mock so we can drive a paused aave scope.
const gateMock = vi.hoisted(() => ({
  value: { protocol: null as string | null, aave: null as string | null },
}));
vi.mock("@/hooks/useProtocolGate", () => ({
  useProtocolGateState: () => gateMock.value,
}));

import { getWalletClientOnExpectedChain } from "@/clients/eth-contract/walletChain";
import { COPY } from "@/copy";
import {
  ContractError,
  ErrorCode,
  SendOutcomeUnknownError,
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
    expect(getWalletClientOnExpectedChain).not.toHaveBeenCalled();
  });
});

describe("useBorrowTransaction — confirming", () => {
  it("reads as confirming from the moment the borrow's transaction is included until the borrow ends", async () => {
    let finish!: () => void;
    mockBorrow.mockImplementation(async (...args: unknown[]) => {
      const onIncluded = args[args.length - 1] as () => void;
      onIncluded();
      await new Promise<void>((resolve) => {
        finish = resolve;
      });
      return { transactionHash: "0xhash" };
    });
    const { result } = renderHook(() => useBorrowTransaction());
    let pending!: Promise<unknown>;
    act(() => {
      pending = result.current.executeBorrow(100, LIVE_RESERVE);
    });
    await waitFor(() => expect(result.current.isConfirming).toBe(true));

    await act(async () => {
      finish();
      await pending;
    });
    expect(result.current.isConfirming).toBe(false);
  });

  it("reads as confirming while it refreshes after the lock's watch finds an unconfirmed borrow mined", async () => {
    let mine!: (receipt: unknown) => void;
    mockWaitReceipt.mockReturnValue(
      new Promise((resolve) => {
        mine = resolve;
      }),
    );
    mockBorrow.mockRejectedValue(unconfirmedBorrow());
    let refreshed!: () => void;
    const refresh = new Promise<void>((resolve) => {
      refreshed = resolve;
    });
    mockInvalidateQueries.mockImplementation(() => refresh);
    const { result } = renderHook(() => useBorrowTransaction());
    let borrowing!: Promise<string>;
    await act(async () => {
      borrowing = result.current.executeBorrow(100, LIVE_RESERVE);
    });

    await act(async () => {
      mine({
        status: "success",
        transactionHash: HASH,
        from: "0xuser",
        logs: [],
      });
    });
    try {
      await waitFor(() => {
        expect(result.current.pendingWrite).toBeNull();
        expect(result.current.isConfirming).toBe(true);
      });
      expect(result.current.isProcessing).toBe(true);
    } finally {
      // Ends the write either way, so the account's lock does not outlive
      // this test.
      await act(async () => {
        refreshed();
        await borrowing;
      });
    }
    expect(result.current.isConfirming).toBe(false);
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
    expect(getWalletClientOnExpectedChain).toHaveBeenCalledWith("0xuser");
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
    expect(getWalletClientOnExpectedChain).not.toHaveBeenCalled();
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
    expect(getWalletClientOnExpectedChain).not.toHaveBeenCalled();
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
      mine({
        status: "success",
        transactionHash: HASH,
        from: "0xuser",
        logs: [],
      });
      await expect(borrowing).resolves.toBe("succeeded");
    });
    expect(getWalletClientOnExpectedChain).toHaveBeenCalledWith("0xuser");
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
    expect(getWalletClientOnExpectedChain).toHaveBeenCalledTimes(1);

    await act(async () => {
      mine({
        status: "success",
        transactionHash: HASH,
        from: "0xuser",
        logs: [],
      });
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

  it('reports a "nonce too low" for a borrow the wallet may have broadcast as an unknown outcome, not a failure, and refreshes the position', async () => {
    mockBorrow.mockRejectedValue(
      new SendOutcomeUnknownError(
        new Error("nonce too low: next nonce 789, tx nonce 788"),
      ),
    );
    const { result } = renderHook(() => useBorrowTransaction());

    let resolved: string | undefined;
    await act(async () => {
      resolved = await result.current.executeBorrow(100, LIVE_RESERVE);
    });

    expect(resolved).toBe("unknown");
    expect(result.current.notice).toBe(
      COPY.common.classifiedErrors.sendOutcomeUnknown,
    );
    expect(result.current.error).toBeNull();
    expect(
      mockInvalidateQueries.mock.calls.map((call) => call[0].queryKey),
    ).toContainEqual(["aaveUserPosition"]);
  });

  it("fails with the reverted copy when the late borrow is mined but reverted", async () => {
    mockWaitReceipt.mockResolvedValue({
      status: "reverted",
      logs: [],
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

  it("stops reading as confirming while it refreshes after the user stops waiting on a borrow seen mined", async () => {
    vi.useFakeTimers();
    let refreshed!: () => void;
    const refresh = new Promise<void>((resolve) => {
      refreshed = resolve;
    });
    let borrowing: Promise<string> | undefined;
    try {
      // Seen mined, then never deep enough on the chain.
      mockBorrow.mockImplementation(async (...args: unknown[]) => {
        const onIncluded = args[args.length - 1] as () => void;
        onIncluded();
        throw unconfirmedBorrow();
      });
      mockWaitReceipt.mockReturnValue(new Promise(() => {}));
      mockInvalidateQueries.mockImplementation(() => refresh);
      const { result } = renderHook(() => useBorrowTransaction());
      await act(async () => {
        borrowing = result.current.executeBorrow(100, LIVE_RESERVE);
      });
      expect(result.current.isConfirming).toBe(true);
      await act(async () => {
        await vi.advanceTimersByTimeAsync(STOP_WAITING_AVAILABLE_AFTER_MS);
      });
      const pending = result.current.pendingWrite;
      if (pending?.phase !== "unconfirmed" || !pending.stopWaiting) {
        throw new Error("expected the stop-waiting action to be offered");
      }

      await act(async () => {
        pending.stopWaiting?.();
      });

      expect(result.current.pendingWrite).toBeNull();
      expect(result.current.isProcessing).toBe(true);
      expect(result.current.isConfirming).toBe(false);
    } finally {
      // Ends the borrow either way, so the account's lock does not outlive
      // this test.
      await act(async () => {
        refreshed();
        await borrowing;
      });
      vi.useRealTimers();
    }
  });
});
