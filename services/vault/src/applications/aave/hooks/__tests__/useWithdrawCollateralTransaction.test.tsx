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

vi.mock("wagmi", () => ({
  useWalletClient: () => ({ data: { account: { address: "0xuser" } } }),
  useAccount: () => ({ address: "0xuser" }),
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

import { COPY } from "@/copy";
import {
  ContractError,
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
  });

  it("leaves the position query untouched when the transaction reverts", async () => {
    mockWithdraw.mockRejectedValue(new Error("execution reverted"));
    const { client, result } = setup();

    let resolved: boolean | undefined;
    await act(async () => {
      resolved = await result.current.executeWithdraw([VAULT_ID]);
    });

    expect(resolved).toBe(false);
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

    let resolved: boolean | undefined;
    await act(async () => {
      resolved = await result.current.executeWithdraw([VAULT_ID]);
    });

    expect(resolved).toBe(false);
    expect(result.current.notice).toBe(COPY.common.transactionInFlight);
    expect(result.current.error).toBeNull();
    expect(mockWithdraw).not.toHaveBeenCalled();
  });

  it("does not mark the vaults withdrawing when the user stops waiting on an unconfirmed withdrawal", async () => {
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

      let withdrawing!: Promise<boolean>;
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
        await expect(withdrawing).resolves.toBe(false);
      });

      expect(mockMarkVaultsAsPending).not.toHaveBeenCalled();
      expect(invalidate).toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });
});
