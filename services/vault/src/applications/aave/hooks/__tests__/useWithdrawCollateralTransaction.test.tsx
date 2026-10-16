import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockWithdraw = vi.fn();
const mockAssertAmounts = vi.fn();
const { FakeCollateralAmountMismatchError, FakeCollateralRegistryReadError } =
  vi.hoisted(() => {
    class FakeCollateralAmountMismatchError extends Error {
      readonly code = "COLLATERAL_AMOUNT_MISMATCH";
    }
    class FakeCollateralRegistryReadError extends Error {}
    return {
      FakeCollateralAmountMismatchError,
      FakeCollateralRegistryReadError,
    };
  });
vi.mock("../../services", () => ({
  CollateralAmountMismatchError: FakeCollateralAmountMismatchError,
  CollateralRegistryReadError: FakeCollateralRegistryReadError,
  assertCollateralAmountsMatchOnChain: (...args: unknown[]) =>
    mockAssertAmounts(...args),
  withdrawSelectedCollateral: (...args: unknown[]) => mockWithdraw(...args),
}));

const ADAPTER = "0x000000000000000000000000000000000000ada9";
vi.mock("../../config", () => ({
  getAaveAdapterAddress: () => ADAPTER,
}));

const mockMarkVaultsAsPending = vi.fn();
vi.mock("../../context", () => ({
  usePendingVaults: () => ({
    markVaultsAsPending: mockMarkVaultsAsPending,
  }),
}));

vi.mock("@/context/wallet", () => ({
  useETHWallet: () => ({ address: "0xuser" }),
}));

vi.mock("@/clients/eth-contract/walletChain", () => ({
  getWalletClientOnExpectedChain: vi
    .fn()
    .mockResolvedValue({ account: { address: "0xuser" } }),
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

import { getWalletClientOnExpectedChain } from "@/clients/eth-contract/walletChain";
import { COPY } from "@/copy";
import {
  ContractError,
  SendOutcomeUnknownError,
  TransactionInFlightError,
  UnconfirmedTransactionError,
} from "@/utils/errors";

import { STOP_WAITING_AVAILABLE_AFTER_MS } from "../../constants";
import { useWithdrawCollateralTransaction } from "../useWithdrawCollateralTransaction";

const VAULT_ID =
  "0xaaaa000000000000000000000000000000000000000000000000000000000001";
const SECOND_VAULT_ID =
  "0xbbbb000000000000000000000000000000000000000000000000000000000002";

const SELECTION = [{ vaultId: VAULT_ID, amountSats: 60_000_000n }] as const;

const POSITION_KEY = [
  "aaveUserPosition",
  "0xUser",
  "0xspoke",
  "3",
  ["7"],
] as const;

function setup() {
  const client = new QueryClient();
  client.setQueryData(POSITION_KEY, "cached");
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return {
    client,
    ...renderHook(() => useWithdrawCollateralTransaction(), { wrapper }),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockWithdraw.mockResolvedValue({ transactionHash: "0xtx", receipt: {} });
  mockAssertNoTransactionInFlight.mockResolvedValue(undefined);
  mockAssertAmounts.mockResolvedValue(undefined);
});

describe("useWithdrawCollateralTransaction", () => {
  it("invalidates the Aave position once the withdrawal is mined", async () => {
    const { client, result } = setup();

    await act(async () => {
      await result.current.executeWithdraw(SELECTION);
    });

    expect(client.getQueryState(POSITION_KEY)?.isInvalidated).toBe(true);
    expect(getWalletClientOnExpectedChain).toHaveBeenCalledWith("0xuser");
  });

  it("reads as confirming from the moment the withdrawal's transaction is included until the withdrawal ends", async () => {
    let finish!: () => void;
    mockWithdraw.mockImplementation(async (...args: unknown[]) => {
      const onIncluded = args[args.length - 1] as () => void;
      onIncluded();
      await new Promise<void>((resolve) => {
        finish = resolve;
      });
      return { transactionHash: "0xtx", receipt: {} };
    });
    const { result } = setup();
    let pending!: Promise<unknown>;
    act(() => {
      pending = result.current.executeWithdraw(SELECTION);
    });
    await waitFor(() => expect(result.current.isConfirming).toBe(true));

    await act(async () => {
      finish();
      await pending;
    });
    expect(result.current.isConfirming).toBe(false);
  });

  it("reads as confirming while it refreshes after the lock's watch finds an unconfirmed withdrawal mined", async () => {
    const hash =
      "0x5555555555555555555555555555555555555555555555555555555555555555";
    let mine!: (receipt: unknown) => void;
    mockWaitReceipt.mockReturnValue(
      new Promise((resolve) => {
        mine = resolve;
      }),
    );
    mockWithdraw.mockRejectedValue(
      new UnconfirmedTransactionError(new ContractError("timed out"), {
        hash,
        from: "0xuser" as `0x${string}`,
        to: "0xadapter" as `0x${string}`,
        data: "0x",
        nonce: null,
        sentAtBlock: null,
      }),
    );
    const { client, result } = setup();
    let refreshed!: () => void;
    const refresh = new Promise<void>((resolve) => {
      refreshed = resolve;
    });
    vi.spyOn(client, "invalidateQueries").mockImplementation(() => refresh);
    let withdrawing!: Promise<string>;
    await act(async () => {
      withdrawing = result.current.executeWithdraw(SELECTION);
    });

    await act(async () => {
      mine({
        status: "success",
        transactionHash: hash,
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
        await withdrawing;
      });
    }
    expect(result.current.isConfirming).toBe(false);
  });

  it("marks the withdrawn vault pending so the list can show it withdrawing", async () => {
    const { result } = setup();

    await act(async () => {
      await result.current.executeWithdraw(SELECTION);
    });

    expect(mockMarkVaultsAsPending).toHaveBeenCalledWith(
      [VAULT_ID],
      "withdraw",
    );
    expect(getWalletClientOnExpectedChain).toHaveBeenCalledWith("0xuser");
  });

  it("leaves the position query untouched when the transaction reverts", async () => {
    mockWithdraw.mockRejectedValue(new Error("execution reverted"));
    const { client, result } = setup();

    let resolved: string | undefined;
    await act(async () => {
      resolved = await result.current.executeWithdraw(SELECTION);
    });

    expect(resolved).toBe("failed");
    expect(client.getQueryState(POSITION_KEY)?.isInvalidated).toBe(false);
    expect(mockMarkVaultsAsPending).not.toHaveBeenCalled();
  });
});

describe("useWithdrawCollateralTransaction - on-chain amount guard", () => {
  it("checks the reviewed amounts against the registry before sending", async () => {
    const { result } = setup();

    await act(async () => {
      await result.current.executeWithdraw(SELECTION);
    });

    expect(mockAssertAmounts).toHaveBeenCalledWith(SELECTION, ADAPTER);
    expect(mockAssertAmounts.mock.invocationCallOrder[0]).toBeLessThan(
      mockWithdraw.mock.invocationCallOrder[0],
    );
  });

  it("refuses with the integrity message and sends nothing when a reviewed amount differs from the registry", async () => {
    mockAssertAmounts.mockRejectedValue(
      new FakeCollateralAmountMismatchError("amount mismatch"),
    );
    const { result } = setup();

    let resolved: string | undefined;
    await act(async () => {
      resolved = await result.current.executeWithdraw(SELECTION);
    });

    expect(resolved).toBe("failed");
    expect(result.current.error).toBe(COPY.withdraw.integrityError);
    expect(mockWithdraw).not.toHaveBeenCalled();
    expect(mockMarkVaultsAsPending).not.toHaveBeenCalled();
  });

  it("shows the verification-failed message and sends nothing when the registry read fails", async () => {
    mockAssertAmounts.mockRejectedValue(
      new FakeCollateralRegistryReadError("rpc unavailable"),
    );
    const { result } = setup();

    let resolved: string | undefined;
    await act(async () => {
      resolved = await result.current.executeWithdraw(SELECTION);
    });

    expect(resolved).toBe("failed");
    expect(result.current.error).toBe(COPY.withdraw.verificationFailed);
    expect(mockWithdraw).not.toHaveBeenCalled();
  });

  it("sends only the selection's vault IDs, in review order", async () => {
    const { result } = setup();

    await act(async () => {
      await result.current.executeWithdraw([
        { vaultId: SECOND_VAULT_ID, amountSats: 20_000_000n },
        { vaultId: VAULT_ID, amountSats: 60_000_000n },
      ]);
    });

    expect(mockWithdraw).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      [SECOND_VAULT_ID, VAULT_ID],
      expect.any(Function),
    );
  });
});

describe("useWithdrawCollateralTransaction — transaction outcome", () => {
  it("refuses before sending while the wallet has a pending transaction", async () => {
    mockAssertNoTransactionInFlight.mockRejectedValue(
      new TransactionInFlightError(),
    );
    const { result } = setup();

    let resolved: string | undefined;
    await act(async () => {
      resolved = await result.current.executeWithdraw(SELECTION);
    });

    expect(resolved).toBe("failed");
    expect(result.current.notice).toBe(COPY.common.transactionInFlight);
    expect(result.current.error).toBeNull();
    expect(mockAssertAmounts).not.toHaveBeenCalled();
    expect(mockWithdraw).not.toHaveBeenCalled();
    expect(getWalletClientOnExpectedChain).not.toHaveBeenCalled();
  });

  it('reports a "nonce too low" for a withdrawal the wallet may have broadcast as an unknown outcome, not a failure, and refreshes the position', async () => {
    mockWithdraw.mockRejectedValue(
      new SendOutcomeUnknownError(
        new Error("nonce too low: next nonce 789, tx nonce 788"),
      ),
    );
    const { client, result } = setup();

    let resolved: string | undefined;
    await act(async () => {
      resolved = await result.current.executeWithdraw(SELECTION);
    });

    expect(resolved).toBe("unknown");
    expect(result.current.notice).toBe(
      COPY.common.classifiedErrors.sendOutcomeUnknown,
    );
    expect(result.current.error).toBeNull();
    expect(client.getQueryState(POSITION_KEY)?.isInvalidated).toBe(true);
  });

  it("reports an unknown outcome with the stopped notice, and does not mark the vaults withdrawing, when the user stops waiting", async () => {
    vi.useFakeTimers();
    try {
      mockWithdraw.mockRejectedValue(
        new UnconfirmedTransactionError(new ContractError("timed out"), {
          hash: "0x5555555555555555555555555555555555555555555555555555555555555555",
          from: "0xuser" as `0x${string}`,
          to: "0xadapter" as `0x${string}`,
          data: "0x",
          nonce: null,
          sentAtBlock: null,
        }),
      );
      // A receipt that never arrives, like a Safe proposal no one executes.
      mockWaitReceipt.mockReturnValue(new Promise(() => {}));
      const { client, result } = setup();
      // Ten minutes outlive the query cache's garbage-collection time, so
      // the refresh is observed on the client rather than on the cache.
      const invalidate = vi.spyOn(client, "invalidateQueries");

      let withdrawing!: Promise<string>;
      await act(async () => {
        withdrawing = result.current.executeWithdraw(SELECTION);
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
        await expect(withdrawing).resolves.toBe("unknown");
      });

      expect(result.current.notice).toBe(
        COPY.common.unconfirmedTransaction.stopped,
      );
      expect(mockMarkVaultsAsPending).not.toHaveBeenCalled();
      expect(invalidate).toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });
});
