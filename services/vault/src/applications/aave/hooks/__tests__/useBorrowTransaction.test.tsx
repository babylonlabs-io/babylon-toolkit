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

const mockTrackEvent = vi.hoisted(() => vi.fn());
vi.mock("@/infrastructure/analytics", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/infrastructure/analytics")>()),
  trackEvent: mockTrackEvent,
}));

/** Each tracked event with its fields, built the way trackEvent builds them. */
function trackedEvents(): [unknown, unknown][] {
  return mockTrackEvent.mock.calls.map(([event, properties]) => [
    event,
    typeof properties === "function" ? properties() : properties,
  ]);
}

vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ invalidateQueries: mockInvalidateQueries }),
}));

const ethWallet = vi.hoisted(() => ({ address: "0xuser" }));
vi.mock("@/context/wallet", () => ({
  useETHWallet: () => ethWallet,
}));

const reserveLabel = vi.hoisted(() => ({ throws: false }));
vi.mock("../../utils/reserveTokenLabel", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../utils/reserveTokenLabel")>();
  return {
    ...actual,
    getReserveTokenLabel: (
      ...args: Parameters<typeof actual.getReserveTokenLabel>
    ) => {
      if (reserveLabel.throws) throw new Error("label lookup failed");
      return actual.getReserveTokenLabel(...args);
    },
  };
});

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
import { CORE_HUB } from "@/test/deploymentAddresses";
import {
  ContractError,
  ErrorCode,
  SendOutcomeUnknownError,
  TransactionInFlightError,
  TransactionReplacedError,
  UnconfirmedTransactionError,
} from "@/utils/errors";

import { STOP_WAITING_AVAILABLE_AFTER_MS } from "../../constants";
import { getPendingAaveWrite } from "../../services/pendingAaveWrite";
import { BorrowReserveCapUnavailableError } from "../../utils/borrowReserveLimit";
import { useBorrowTransaction } from "../useBorrowTransaction";

const RESERVE = {} as never;
// The underlying is the registry's mainnet USDC.
const USDC_UNDERLYING = "0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85";
const LIVE_RESERVE = {
  reserveId: "r1",
  reserve: { underlying: USDC_UNDERLYING },
  token: { address: "0xtoken", decimals: 6, symbol: "USDC" },
} as never;
const BORROW_FIELDS = { reserve: "USDC", wallet_address: "0xuser" };

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
  ethWallet.address = "0xuser";
  reserveLabel.throws = false;
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
        reserve: {
          hub: CORE_HUB,
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
  it("keeps waiting on a borrow whose receipt wait timed out and succeeds once it is mined, naming the account that sent it", async () => {
    let mine!: (receipt: unknown) => void;
    mockWaitReceipt.mockReturnValue(
      new Promise((resolve) => {
        mine = resolve;
      }),
    );
    mockBorrow.mockRejectedValue(unconfirmedBorrow());
    const { result, rerender } = renderHook(() => useBorrowTransaction());

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

    // The user switches account in the wallet while the borrow is unconfirmed.
    ethWallet.address = "0xother";
    rerender();
    // The hook now shows the other account's lock; the sender's still holds.
    expect(getPendingAaveWrite("0xuser")).not.toBeNull();

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
    expect(getPendingAaveWrite("0xuser")).toBeNull();
    expect(mockInvalidateQueries).toHaveBeenCalled();
    expect(trackedEvents()).toEqual([
      ["borrow_started", BORROW_FIELDS],
      ["borrow_succeeded", BORROW_FIELDS],
    ]);
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
      // A borrow with no receipt is never reported as succeeded.
      expect(trackedEvents()).toEqual([["borrow_started", BORROW_FIELDS]]);
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

describe("useBorrowTransaction — analytics", () => {
  it("sends borrow_started and borrow_succeeded with the reserve symbol and the borrowing account once the borrow is mined", async () => {
    mockBorrow.mockResolvedValue({ transactionHash: HASH });
    const { result } = renderHook(() => useBorrowTransaction());

    await act(async () => {
      await result.current.executeBorrow(100, LIVE_RESERVE);
    });

    expect(trackedEvents()).toEqual([
      ["borrow_started", BORROW_FIELDS],
      ["borrow_succeeded", BORROW_FIELDS],
    ]);
  });

  it("sends the registry's symbol for a registered token, not the indexer's", async () => {
    mockBorrow.mockResolvedValue({ transactionHash: HASH });
    const { result } = renderHook(() => useBorrowTransaction());

    await act(async () => {
      await result.current.executeBorrow(100, {
        reserveId: "r1",
        reserve: { underlying: USDC_UNDERLYING },
        token: { address: "0xtoken", decimals: 6, symbol: "FAKE" },
      } as never);
    });

    expect(trackedEvents()).toContainEqual([
      "borrow_started",
      {
        reserve: "USDC",
        wallet_address: "0xuser",
      },
    ]);
  });

  it("bounds an unregistered token's indexer label to 32 characters", async () => {
    mockBorrow.mockResolvedValue({ transactionHash: HASH });
    const { result } = renderHook(() => useBorrowTransaction());

    await act(async () => {
      await result.current.executeBorrow(100, {
        reserveId: "r1",
        reserve: { underlying: "0x0000000000000000000000000000000000000001" },
        token: { address: "0xtoken", decimals: 6, symbol: "T".repeat(50) },
      } as never);
    });

    expect(trackedEvents()).toContainEqual([
      "borrow_started",
      {
        reserve: "T".repeat(32),
        wallet_address: "0xuser",
      },
    ]);
  });

  it("keeps an emoji whole when bounding an unregistered token's label", async () => {
    mockBorrow.mockResolvedValue({ transactionHash: HASH });
    const { result } = renderHook(() => useBorrowTransaction());

    await act(async () => {
      await result.current.executeBorrow(100, {
        reserveId: "r1",
        reserve: { underlying: "0x0000000000000000000000000000000000000001" },
        token: {
          address: "0xtoken",
          decimals: 6,
          symbol: `${"T".repeat(31)}\u{1F600}X`,
        },
      } as never);
    });

    expect(trackedEvents()).toContainEqual([
      "borrow_started",
      {
        reserve: `${"T".repeat(31)}\u{1F600}`,
        wallet_address: "0xuser",
      },
    ]);
  });

  it("passes the analytics fields as a builder, so a reserve label that cannot be read does not stop the borrow", async () => {
    reserveLabel.throws = true;
    mockBorrow.mockResolvedValue({ transactionHash: HASH });
    const { result } = renderHook(() => useBorrowTransaction());

    let resolved: string | undefined;
    await act(async () => {
      resolved = await result.current.executeBorrow(100, LIVE_RESERVE);
    });

    expect(mockBorrow).toHaveBeenCalled();
    expect(resolved).toBe("succeeded");
  });

  it("sends borrow_started but no borrow_succeeded when the borrow reverts", async () => {
    mockBorrow.mockRejectedValue(new Error("execution reverted"));
    const { result } = renderHook(() => useBorrowTransaction());

    await act(async () => {
      await result.current.executeBorrow(100, LIVE_RESERVE);
    });

    expect(trackedEvents()).toEqual([["borrow_started", BORROW_FIELDS]]);
  });

  it("sends nothing for a borrow the pre-sign validation refuses", async () => {
    const { result } = renderHook(() => useBorrowTransaction());

    await act(async () => {
      await result.current.executeBorrow(100, LIVE_RESERVE, async () => {
        throw new Error("Health factor too low");
      });
    });

    expect(mockBorrow).not.toHaveBeenCalled();
    expect(mockTrackEvent).not.toHaveBeenCalled();
  });

  it("sends nothing for a borrow whose chain switch the user declines", async () => {
    vi.mocked(getWalletClientOnExpectedChain).mockRejectedValueOnce(
      new Error("User rejected the chain switch"),
    );
    const { result } = renderHook(() => useBorrowTransaction());

    await act(async () => {
      await result.current.executeBorrow(100, LIVE_RESERVE);
    });

    expect(mockBorrow).not.toHaveBeenCalled();
    expect(mockTrackEvent).not.toHaveBeenCalled();
  });

  it("sends nothing for a borrow refused while another transaction is in flight", async () => {
    mockAssertNoTransactionInFlight.mockRejectedValue(
      new TransactionInFlightError(),
    );
    const { result } = renderHook(() => useBorrowTransaction());

    await act(async () => {
      await result.current.executeBorrow(100, LIVE_RESERVE);
    });

    expect(mockTrackEvent).not.toHaveBeenCalled();
  });
});
