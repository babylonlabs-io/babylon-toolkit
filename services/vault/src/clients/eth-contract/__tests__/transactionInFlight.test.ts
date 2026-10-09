import { HttpRequestError, type PublicClient } from "viem";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { COPY } from "@/copy";
import { TransactionInFlightError } from "@/utils/errors";

const { mockGetTransactionCount, mockError } = vi.hoisted(() => ({
  mockGetTransactionCount: vi.fn(),
  mockError: vi.fn(),
}));

vi.mock("viem/actions", () => ({
  getTransactionCount: (...args: unknown[]) => mockGetTransactionCount(...args),
}));

vi.mock("@/infrastructure", () => ({
  logger: { warn: vi.fn(), error: mockError, info: vi.fn(), event: vi.fn() },
}));

import { assertNoTransactionInFlight } from "../transactionInFlight";

const ACCOUNT = "0x2000000000000000000000000000000000000002";
const publicClient = { chain: { id: 11155111 } } as unknown as PublicClient;

/** Answer the count read for each block tag. */
function counts({ latest, pending }: { latest: number; pending: number }) {
  mockGetTransactionCount.mockImplementation(
    async (_client: unknown, { blockTag }: { blockTag: string }) =>
      blockTag === "pending" ? pending : latest,
  );
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("assertNoTransactionInFlight", () => {
  it("lets the write go ahead when the RPC holds no pending transaction from the account", async () => {
    counts({ latest: 7, pending: 7 });

    await expect(
      assertNoTransactionInFlight({ publicClient, account: ACCOUNT }),
    ).resolves.toBeUndefined();
  });

  it("refuses the write while the RPC still holds a transaction from the account a moment later", async () => {
    counts({ latest: 7, pending: 8 });

    const check = assertNoTransactionInFlight({
      publicClient,
      account: ACCOUNT,
    }).catch((e: unknown) => e);
    await vi.runAllTimersAsync();
    const thrown = await check;

    expect(thrown).toBeInstanceOf(TransactionInFlightError);
    expect((thrown as Error).message).toBe(COPY.common.transactionInFlight);
    expect(mockGetTransactionCount).toHaveBeenCalledTimes(4);
  });

  it("lets the write go ahead when a read a moment later no longer shows the transaction pending", async () => {
    // A backend a block behind still held the just-mined transaction.
    counts({ latest: 7, pending: 8 });
    const check = assertNoTransactionInFlight({
      publicClient,
      account: ACCOUNT,
    });
    await vi.advanceTimersByTimeAsync(0);
    counts({ latest: 8, pending: 8 });
    await vi.runAllTimersAsync();

    await expect(check).resolves.toBeUndefined();
  });

  it("lets the write go ahead when a lagging backend reports fewer pending than mined", async () => {
    counts({ latest: 8, pending: 7 });

    await expect(
      assertNoTransactionInFlight({ publicClient, account: ACCOUNT }),
    ).resolves.toBeUndefined();
  });

  it("reads both counts for the account from the app's RPC once when nothing is pending", async () => {
    counts({ latest: 7, pending: 7 });

    await assertNoTransactionInFlight({ publicClient, account: ACCOUNT });

    expect(mockGetTransactionCount).toHaveBeenCalledTimes(2);
    expect(mockGetTransactionCount).toHaveBeenCalledWith(publicClient, {
      address: ACCOUNT,
      blockTag: "latest",
    });
    expect(mockGetTransactionCount).toHaveBeenCalledWith(publicClient, {
      address: ACCOUNT,
      blockTag: "pending",
    });
  });

  it("lets the write go ahead, and reports the failure, when a count read fails", async () => {
    const failure = new HttpRequestError({ url: "https://rpc.example" });
    mockGetTransactionCount.mockRejectedValue(failure);

    await expect(
      assertNoTransactionInFlight({ publicClient, account: ACCOUNT }),
    ).resolves.toBeUndefined();
    expect(mockError).toHaveBeenCalledWith(failure, expect.anything());
  });
});
