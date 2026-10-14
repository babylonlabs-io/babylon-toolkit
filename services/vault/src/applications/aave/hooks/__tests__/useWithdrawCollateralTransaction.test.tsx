import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
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
