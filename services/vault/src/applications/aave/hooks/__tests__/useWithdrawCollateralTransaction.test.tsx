import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockWithdraw = vi.fn();
vi.mock("../../services", () => ({
  withdrawSelectedCollateral: (...args: unknown[]) => mockWithdraw(...args),
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
});

describe("useWithdrawCollateralTransaction", () => {
  it("invalidates the Aave position once the withdrawal is mined", async () => {
    const { client, result } = setup();

    await act(async () => {
      await result.current.executeWithdraw([VAULT_ID]);
    });

    expect(client.getQueryState(POSITION_KEY)?.isInvalidated).toBe(true);
    expect(getWalletClientOnExpectedChain).toHaveBeenCalledWith("0xuser");
  });

  it("marks the withdrawn vault pending so the list can show it withdrawing", async () => {
    const { result } = setup();

    await act(async () => {
      await result.current.executeWithdraw([VAULT_ID]);
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
      resolved = await result.current.executeWithdraw([VAULT_ID]);
    });

    expect(resolved).toBe("failed");
    expect(client.getQueryState(POSITION_KEY)?.isInvalidated).toBe(false);
    expect(mockMarkVaultsAsPending).not.toHaveBeenCalled();
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
      resolved = await result.current.executeWithdraw([VAULT_ID]);
    });

    expect(resolved).toBe("failed");
    expect(result.current.notice).toBe(COPY.common.transactionInFlight);
    expect(result.current.error).toBeNull();
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
      resolved = await result.current.executeWithdraw([VAULT_ID]);
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
        withdrawing = result.current.executeWithdraw([VAULT_ID]);
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
