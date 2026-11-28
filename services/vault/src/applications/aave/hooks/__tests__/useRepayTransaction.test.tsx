import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockAssertReserve = vi.fn();
const mockRepayAll = vi.fn();
const mockRepayPartial = vi.fn();
const mockInvalidateQueries = vi.hoisted(() => vi.fn());
vi.mock("../../services", () => ({
  assertReserveMatchesOnChain: (...a: unknown[]) => mockAssertReserve(...a),
  repayAll: (...a: unknown[]) => mockRepayAll(...a),
  repayPartial: (...a: unknown[]) => mockRepayPartial(...a),
  ReserveMismatchError: class ReserveMismatchError extends Error {},
  ProxyMismatchError: class ProxyMismatchError extends Error {},
}));

vi.mock("../../config", () => ({
  getAaveAdapterAddress: () => "0xadapter",
}));

vi.mock("@/clients/eth-contract", () => ({
  ERC20: { getERC20Decimals: vi.fn() },
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

// The receipt wait the app-wide lock resumes for an unconfirmed repay.
const mockWaitReceipt = vi.hoisted(() => vi.fn());
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

// Local override of the global gate mock so we can drive a paused scope.
const gateMock = vi.hoisted(() => ({
  value: { protocol: null as string | null, aave: null as string | null },
}));
vi.mock("@/hooks/useProtocolGate", () => ({
  useProtocolGateState: () => gateMock.value,
}));

import { COPY } from "@/copy";
import {
  ContractError,
  SendOutcomeUnknownError,
  TransactionInFlightError,
  TransactionReplacedError,
  UnconfirmedTransactionError,
} from "@/utils/errors";

import { STOP_WAITING_AVAILABLE_AFTER_MS } from "../../constants";
import { ProxyMismatchError } from "../../services";
import { useRepayTransaction } from "../useRepayTransaction";

const RESERVE_TOKEN = { address: "0xtoken", decimals: 6, symbol: "USDC" };
const RESERVE = {
  reserveId: "r1",
  token: RESERVE_TOKEN,
} as never;

function setup() {
  return renderHook(() => useRepayTransaction({ proxyContract: "0xproxy" }));
}

beforeEach(() => {
  vi.clearAllMocks();
  // `clearAllMocks` keeps implementations, so a refresh one test holds open
  // would otherwise hold every later one too.
  mockInvalidateQueries.mockReset();
  gateMock.value = { protocol: null, aave: null };
  mockAssertNoTransactionInFlight.mockResolvedValue(undefined);
});

describe("useRepayTransaction — pause gating (either scope paused)", () => {
  it("returns false without any on-chain read when the aave scope is paused", async () => {
    gateMock.value = { protocol: null, aave: "paused" };
    const { result } = setup();

    let resolved: string | undefined;
    await act(async () => {
      resolved = await result.current.executeRepay(100, RESERVE);
    });

    expect(resolved).toBe("failed");
    expect(mockAssertReserve).not.toHaveBeenCalled();
    expect(mockRepayAll).not.toHaveBeenCalled();
  });

  it("blocks under a protocol-only pause — a protocol pause is a full stop", async () => {
    gateMock.value = { protocol: "paused", aave: null };
    const { result } = setup();

    let resolved: string | undefined;
    await act(async () => {
      resolved = await result.current.executeRepay(100, RESERVE);
    });

    expect(resolved).toBe("failed");
    expect(mockAssertReserve).not.toHaveBeenCalled();
    expect(mockRepayAll).not.toHaveBeenCalled();
  });
});

describe("useRepayTransaction — max mode wiring", () => {
  it("fails without calling repayAll when proxyContract is missing", async () => {
    const { result } = renderHook(() =>
      useRepayTransaction({ proxyContract: undefined }),
    );

    let resolved: string | undefined;
    await act(async () => {
      resolved = await result.current.executeRepay(100, RESERVE, "max", {
        repayAmountRaw: 123n,
      });
    });

    expect(resolved).toBe("failed");
    expect(result.current.error).toContain("position data not available");
    expect(mockRepayAll).not.toHaveBeenCalled();
  });

  it("refuses max mode without the exact bigint balance", async () => {
    const { result } = setup();

    let resolved: string | undefined;
    await act(async () => {
      resolved = await result.current.executeRepay(100, RESERVE, "max");
    });

    expect(resolved).toBe("failed");
    expect(result.current.error).toContain("requires repayAmountRaw");
    expect(mockRepayAll).not.toHaveBeenCalled();
  });

  it("passes the proxy, exact balance bigint, and token through to repayAll", async () => {
    mockAssertReserve.mockResolvedValue(undefined);
    mockRepayAll.mockResolvedValue({ transactionHash: "0xhash" });
    const { result } = setup();

    let resolved: string | undefined;
    await act(async () => {
      resolved = await result.current.executeRepay(100, RESERVE, "max", {
        repayAmountRaw: 123n,
      });
    });

    expect(resolved).toBe("succeeded");
    expect(mockRepayAll).toHaveBeenCalledWith(
      "0xuser",
      expect.anything(), // chain
      "r1",
      "0xtoken",
      "0xproxy",
      123n,
      RESERVE_TOKEN,
      expect.any(Function), // reports the repay's inclusion to the lock
    );
  });

  it("reads as confirming from the moment the repay's transaction is included until the repay ends", async () => {
    let finish!: () => void;
    mockRepayAll.mockImplementation(async (...args: unknown[]) => {
      const onIncluded = args[args.length - 1] as () => void;
      onIncluded();
      await new Promise<void>((resolve) => {
        finish = resolve;
      });
      return { transactionHash: "0xhash" };
    });
    mockAssertReserve.mockResolvedValue(undefined);
    const { result } = setup();
    let pending!: Promise<unknown>;
    act(() => {
      pending = result.current.executeRepay(100, RESERVE, "max", {
        repayAmountRaw: 123n,
      });
    });
    await waitFor(() => expect(result.current.isConfirming).toBe(true));

    await act(async () => {
      finish();
      await pending;
    });
    expect(result.current.isConfirming).toBe(false);
  });

  it("resolves succeeded for a repay mined on the first wait while the position refresh is still pending", async () => {
    mockAssertReserve.mockResolvedValue(undefined);
    mockRepayAll.mockResolvedValue({ transactionHash: "0xhash" });
    // A refresh that never settles, as behind a stalled indexer.
    mockInvalidateQueries.mockReturnValue(new Promise<never>(() => {}));
    const { result } = setup();

    let resolved: string | undefined;
    await act(async () => {
      resolved = await result.current.executeRepay(100, RESERVE, "max", {
        repayAmountRaw: 123n,
      });
    });

    expect(resolved).toBe("succeeded");
    expect(result.current.isProcessing).toBe(false);
    expect(result.current.isConfirming).toBe(false);
  });

  it("resolves succeeded for a repay the lock's watch finds mined while the position refresh is still pending", async () => {
    const hash =
      "0x5555555555555555555555555555555555555555555555555555555555555555";
    let mine!: (receipt: unknown) => void;
    mockWaitReceipt.mockReturnValue(
      new Promise((resolve) => {
        mine = resolve;
      }),
    );
    mockRepayAll.mockRejectedValue(
      new UnconfirmedTransactionError(new ContractError("timed out"), {
        hash,
        from: "0xuser" as `0x${string}`,
        to: "0xadapter" as `0x${string}`,
        data: "0x",
        nonce: null,
        sentAtBlock: null,
      }),
    );
    mockAssertReserve.mockResolvedValue(undefined);
    // A refresh that never settles, as behind a stalled indexer.
    mockInvalidateQueries.mockReturnValue(new Promise<never>(() => {}));
    const { result } = setup();
    let repaying!: Promise<unknown>;
    await act(async () => {
      repaying = result.current.executeRepay(100, RESERVE, "max", {
        repayAmountRaw: 123n,
      });
    });

    await act(async () => {
      mine({
        status: "success",
        transactionHash: hash,
        from: "0xuser",
        logs: [],
      });
      await expect(repaying).resolves.toBe("succeeded");
    });
    expect(result.current.isProcessing).toBe(false);
    expect(result.current.isConfirming).toBe(false);
  });

  it("stops reading as confirming while it refreshes, then reports unknown, after the user stops waiting on a repay seen mined", async () => {
    vi.useFakeTimers();
    const hash =
      "0x5555555555555555555555555555555555555555555555555555555555555555";
    let mine!: (receipt: unknown) => void;
    let refreshed!: () => void;
    const refresh = new Promise<void>((resolve) => {
      refreshed = resolve;
    });
    let repaying: Promise<string> | undefined;
    try {
      try {
        // Seen mined, then not deep enough on the chain until the test ends.
        mockAssertReserve.mockResolvedValue(undefined);
        mockRepayAll.mockImplementation(async (...args: unknown[]) => {
          const onIncluded = args[args.length - 1] as () => void;
          onIncluded();
          throw new UnconfirmedTransactionError(
            new ContractError("timed out"),
            {
              hash,
              from: "0xuser" as `0x${string}`,
              to: "0xadapter" as `0x${string}`,
              data: "0x",
              nonce: null,
              sentAtBlock: null,
            },
          );
        });
        mockWaitReceipt.mockReturnValue(
          new Promise((resolve) => {
            mine = resolve;
          }),
        );
        mockInvalidateQueries.mockReturnValue(refresh);
        const { result } = setup();
        await act(async () => {
          repaying = result.current.executeRepay(100, RESERVE, "max", {
            repayAmountRaw: 123n,
          });
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

        // Still processing: the repay may still be mined, so it waits for
        // the position before reporting the outcome.
        expect(result.current.pendingWrite).toBeNull();
        expect(result.current.isProcessing).toBe(true);
        expect(result.current.isConfirming).toBe(false);

        await act(async () => {
          refreshed();
          await expect(repaying).resolves.toBe("unknown");
        });
      } finally {
        // Ends the repay however far the test got, so the account's lock does
        // not outlive it: the receipt ends one still waiting on it, and the
        // refresh one the user stopped waiting on.
        await act(async () => {
          mine?.({
            status: "success",
            transactionHash: hash,
            from: "0xuser",
            logs: [],
          });
          refreshed();
          await repaying;
        });
      }
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("useRepayTransaction — cache invalidation", () => {
  it("invalidates the vault, position and hub queries by key prefix after a repay", async () => {
    mockAssertReserve.mockResolvedValue(undefined);
    mockRepayAll.mockResolvedValue({ transactionHash: "0xhash" });
    const { result } = setup();

    await act(async () => {
      await result.current.executeRepay(100, RESERVE, "max", {
        repayAmountRaw: 123n,
      });
    });

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

describe("useRepayTransaction — proxy integrity (F8)", () => {
  it("maps a ProxyMismatchError to the integrity copy and returns false", async () => {
    mockAssertReserve.mockResolvedValueOnce(undefined);
    mockRepayAll.mockRejectedValueOnce(
      new ProxyMismatchError("proxy mismatch"),
    );
    const { result } = setup();

    let resolved: string | undefined;
    await act(async () => {
      resolved = await result.current.executeRepay(100, RESERVE, "max", {
        repayAmountRaw: 123n,
      });
    });

    expect(resolved).toBe("failed");
    expect(result.current.error).toBe(COPY.loans.repay.integrityError);
  });
});

describe("useRepayTransaction — a transaction already in flight", () => {
  it("checks for a pending transaction once, before the reserve check and the repay with its approve", async () => {
    mockAssertReserve.mockResolvedValue(undefined);
    mockRepayAll.mockResolvedValue({ transactionHash: "0xhash" });
    const { result } = setup();

    await act(async () => {
      await result.current.executeRepay(100, RESERVE, "max", {
        repayAmountRaw: 123n,
      });
    });

    expect(mockAssertNoTransactionInFlight).toHaveBeenCalledTimes(1);
    expect(
      mockAssertNoTransactionInFlight.mock.invocationCallOrder[0],
    ).toBeLessThan(mockAssertReserve.mock.invocationCallOrder[0]);
    expect(mockAssertReserve.mock.invocationCallOrder[0]).toBeLessThan(
      mockRepayAll.mock.invocationCallOrder[0],
    );
  });

  it("refuses before any on-chain read while the wallet has a pending transaction", async () => {
    mockAssertNoTransactionInFlight.mockRejectedValue(
      new TransactionInFlightError(),
    );
    const { result } = setup();

    let resolved: string | undefined;
    await act(async () => {
      resolved = await result.current.executeRepay(100, RESERVE, "max", {
        repayAmountRaw: 123n,
      });
    });

    expect(resolved).toBe("failed");
    expect(result.current.notice).toBe(COPY.common.transactionInFlight);
    expect(result.current.error).toBeNull();
    expect(mockAssertReserve).not.toHaveBeenCalled();
    expect(mockRepayAll).not.toHaveBeenCalled();
  });
});

describe("useRepayTransaction — wallet replacement", () => {
  it("reports a replacement it could not read as an unknown outcome, not a failure, and refreshes the position", async () => {
    mockAssertReserve.mockResolvedValue(undefined);
    mockRepayAll.mockRejectedValue(
      new TransactionReplacedError(
        "unknown",
        "0x5555555555555555555555555555555555555555555555555555555555555555",
      ),
    );
    const { result } = setup();

    let resolved: string | undefined;
    await act(async () => {
      resolved = await result.current.executeRepay(100, RESERVE, "max", {
        repayAmountRaw: 123n,
      });
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

  it('reports a "nonce too low" for a repay the wallet may have broadcast as an unknown outcome, not a failure, and refreshes the position', async () => {
    mockAssertReserve.mockResolvedValue(undefined);
    mockRepayAll.mockRejectedValue(
      new SendOutcomeUnknownError(
        new Error("nonce too low: next nonce 789, tx nonce 788"),
      ),
    );
    const { result } = setup();

    let resolved: string | undefined;
    await act(async () => {
      resolved = await result.current.executeRepay(100, RESERVE, "max", {
        repayAmountRaw: 123n,
      });
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
});
