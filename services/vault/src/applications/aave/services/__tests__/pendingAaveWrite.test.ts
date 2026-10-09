import {
  BlockNotFoundError,
  HttpRequestError,
  TransactionReceiptNotFoundError,
  WaitForTransactionReceiptTimeoutError,
} from "viem";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { COPY } from "@/copy";
import {
  ContractError,
  ErrorCode,
  TransactionReplacedError,
  UnconfirmedTransactionError,
  WriteInProgressError,
  type UnconfirmedBroadcast,
} from "@/utils/errors";

const {
  mockWaitReceipt,
  mockGetTransactionCount,
  mockGetTransaction,
  mockGetTransactionReceipt,
  mockGetBlockNumber,
  mockGetBlock,
} = vi.hoisted(() => ({
  mockWaitReceipt: vi.fn(),
  mockGetTransactionCount: vi.fn(),
  mockGetTransaction: vi.fn(),
  mockGetTransactionReceipt: vi.fn(),
  mockGetBlockNumber: vi.fn(),
  mockGetBlock: vi.fn(),
}));

vi.mock("@babylonlabs-io/ts-sdk/tbv/core/utils", () => ({
  waitForTransactionReceiptSmartAware: (...args: unknown[]) =>
    mockWaitReceipt(...args),
}));

vi.mock("viem/actions", () => ({
  getTransactionCount: (...args: unknown[]) => mockGetTransactionCount(...args),
  getTransactionReceipt: vi.fn(),
}));

vi.mock("@/clients/eth-contract/client", () => ({
  ethClient: {
    getPublicClient: () => ({
      getTransaction: mockGetTransaction,
      getTransactionReceipt: mockGetTransactionReceipt,
      getBlockNumber: mockGetBlockNumber,
      getBlock: mockGetBlock,
    }),
  },
}));

vi.mock("@/infrastructure", () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), event: vi.fn() },
}));

import {
  RECEIPT_RETRY_DELAY_MS,
  RECEIPT_WAIT_ROUND_MS,
  STOP_WAITING_AVAILABLE_AFTER_MS,
} from "../../constants";
import { getPendingAaveWrite, runAaveWrite } from "../pendingAaveWrite";

const ACCOUNT = "0xAbCdEf0000000000000000000000000000000002";
const OTHER_ACCOUNT = "0x9000000000000000000000000000000000000009";
const HASH =
  "0x5555555555555555555555555555555555555555555555555555555555555555";
const REPLACEMENT_HASH =
  "0x6666666666666666666666666666666666666666666666666666666666666666";

// Sent at nonce 5 while the chain was at block 100.
const BROADCAST: UnconfirmedBroadcast = {
  hash: HASH,
  from: ACCOUNT,
  to: "0x3000000000000000000000000000000000000003",
  data: "0x1234",
  nonce: 5,
  sentAtBlock: 100n,
};

function unconfirmed(): UnconfirmedTransactionError {
  return new UnconfirmedTransactionError(
    new ContractError("Repay failed: timed out"),
    BROADCAST,
  );
}

function receipt(
  status: "success" | "reverted",
  transactionHash: string = HASH,
) {
  return { status, transactionHash, from: ACCOUNT };
}

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

/**
 * The chain at block 104, where nonce 5 was used at block 102 by a transaction
 * the wallet sent in place of the broadcast one, after the original left the
 * node's pool.
 */
function replacedAtBlock102(replacement: { to: string; input: string }) {
  mockWaitReceipt.mockRejectedValue(
    new WaitForTransactionReceiptTimeoutError({ hash: HASH }),
  );
  mockGetBlockNumber.mockResolvedValue(104n);
  mockGetTransactionCount.mockImplementation(
    async (_client: unknown, { blockNumber }: { blockNumber: bigint }) =>
      blockNumber >= 102n ? 6 : 5,
  );
  mockGetTransactionReceipt.mockImplementation(
    async ({ hash }: { hash: string }) => {
      if (hash === REPLACEMENT_HASH) {
        return receipt("success", REPLACEMENT_HASH);
      }
      throw new TransactionReceiptNotFoundError({ hash: HASH });
    },
  );
  mockGetBlock.mockResolvedValue({
    transactions: [{ from: ACCOUNT, nonce: 5, hash: REPLACEMENT_HASH }],
  });
  mockGetTransaction.mockImplementation(async ({ hash }: { hash: string }) => {
    if (hash === REPLACEMENT_HASH) {
      return { ...replacement, from: ACCOUNT, nonce: 5 };
    }
    throw new Error("transaction not found");
  });
}

/** Let the write's awaited reads run without moving the clock. */
const flush = () => vi.advanceTimersByTimeAsync(0);

beforeEach(() => {
  vi.resetAllMocks();
  vi.useFakeTimers();
  // By default the chain is at block 104 and nonce 5 is not used yet.
  mockGetBlockNumber.mockResolvedValue(104n);
  mockGetTransactionCount.mockResolvedValue(5);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("runAaveWrite", () => {
  it("holds the account's lock while the write runs and releases it once the write is mined", async () => {
    const write = deferred();

    const result = runAaveWrite(ACCOUNT, () => write.promise);

    expect(getPendingAaveWrite(ACCOUNT)).toEqual({ phase: "submitting" });
    write.resolve();
    await expect(result).resolves.toBe("mined");
    expect(getPendingAaveWrite(ACCOUNT)).toBeNull();
  });

  it("refuses a second write for the same account while the first holds the lock", async () => {
    const first = deferred();
    const firstResult = runAaveWrite(ACCOUNT, () => first.promise);
    const second = vi.fn();

    const thrown = await runAaveWrite(
      ACCOUNT.toLowerCase() as `0x${string}`,
      second,
    ).catch((e: unknown) => e);

    expect(thrown).toBeInstanceOf(WriteInProgressError);
    expect((thrown as Error).message).toBe(
      COPY.common.unconfirmedTransaction.inProgress,
    );
    expect(second).not.toHaveBeenCalled();
    first.resolve();
    await firstResult;
  });

  it("runs another account's write while one account holds its lock", async () => {
    const first = deferred();
    const firstResult = runAaveWrite(ACCOUNT, () => first.promise);

    await expect(
      runAaveWrite(OTHER_ACCOUNT, async () => undefined),
    ).resolves.toBe("mined");

    first.resolve();
    await firstResult;
  });

  it("rethrows a failure from before the broadcast and releases the lock", async () => {
    const failure = new ContractError("Repay failed: rejected");

    await expect(
      runAaveWrite(ACCOUNT, () => Promise.reject(failure)),
    ).rejects.toBe(failure);
    expect(getPendingAaveWrite(ACCOUNT)).toBeNull();
  });

  it("keeps an unconfirmed transaction locked and resolves mined once a later round finds its receipt", async () => {
    mockWaitReceipt
      .mockRejectedValueOnce(
        new WaitForTransactionReceiptTimeoutError({ hash: HASH }),
      )
      .mockResolvedValueOnce(receipt("success"));

    const result = runAaveWrite(ACCOUNT, () => Promise.reject(unconfirmed()));
    await flush();

    expect(getPendingAaveWrite(ACCOUNT)).toEqual({
      phase: "unconfirmed",
      hash: HASH,
      stopWaiting: null,
    });
    await vi.advanceTimersByTimeAsync(RECEIPT_RETRY_DELAY_MS);
    await expect(result).resolves.toBe("mined");
    expect(getPendingAaveWrite(ACCOUNT)).toBeNull();
    expect(mockWaitReceipt).toHaveBeenCalledWith(
      expect.objectContaining({ walletAddress: ACCOUNT, hash: HASH }),
    );
  });

  it("bounds every round of waiting, including the SDK's polling of the Safe Transaction Service", async () => {
    mockWaitReceipt.mockResolvedValue(receipt("success"));

    await runAaveWrite(ACCOUNT, () => Promise.reject(unconfirmed()));

    expect(mockWaitReceipt).toHaveBeenCalledWith(
      expect.objectContaining({
        timeout: RECEIPT_WAIT_ROUND_MS,
        safePollTimeoutMs: RECEIPT_WAIT_ROUND_MS,
      }),
    );
  });

  it("keeps waiting through an RPC failure", async () => {
    mockWaitReceipt
      .mockRejectedValueOnce(
        new HttpRequestError({ url: "https://rpc.example" }),
      )
      .mockResolvedValueOnce(receipt("success"));

    const result = runAaveWrite(ACCOUNT, () => Promise.reject(unconfirmed()));
    await flush();
    await vi.advanceTimersByTimeAsync(RECEIPT_RETRY_DELAY_MS);

    await expect(result).resolves.toBe("mined");
  });

  it("keeps waiting when a lagging RPC has not served the block yet", async () => {
    mockWaitReceipt
      .mockRejectedValueOnce(new BlockNotFoundError({ blockNumber: 105n }))
      .mockResolvedValueOnce(receipt("success"));

    const result = runAaveWrite(ACCOUNT, () => Promise.reject(unconfirmed()));
    await flush();
    await vi.advanceTimersByTimeAsync(RECEIPT_RETRY_DELAY_MS);

    await expect(result).resolves.toBe("mined");
  });

  it("ends the wait as a failure when a later round learns the Safe transaction executed and reverted", async () => {
    const safeRevert = new Error(
      "Safe transaction 0x55 was executed on chain but reverted. Check the Safe queue UI for details.",
    );
    mockWaitReceipt.mockRejectedValue(safeRevert);

    await expect(
      runAaveWrite(ACCOUNT, () => Promise.reject(unconfirmed())),
    ).rejects.toBe(safeRevert);
    expect(getPendingAaveWrite(ACCOUNT)).toBeNull();
  });

  it("keeps the lock, and offers to stop waiting at once, when the Safe Transaction Service refuses the request", async () => {
    mockWaitReceipt.mockRejectedValue(
      new Error(`Safe Transaction Service returned 403 for ${HASH}.`),
    );

    const result = runAaveWrite(ACCOUNT, () => Promise.reject(unconfirmed()));
    await flush();

    const pending = getPendingAaveWrite(ACCOUNT);
    expect(pending).toMatchObject({ phase: "unconfirmed", hash: HASH });
    if (pending?.phase !== "unconfirmed" || !pending.stopWaiting) {
      throw new Error("expected the stop-waiting action to be offered");
    }
    pending.stopWaiting();
    await expect(result).resolves.toBe("stopped");
  });

  it("keeps waiting, without offering to stop, when the Safe Transaction Service rate-limits the request", async () => {
    mockWaitReceipt
      .mockRejectedValueOnce(
        new Error(`Safe Transaction Service returned 429 for ${HASH}.`),
      )
      .mockResolvedValueOnce(receipt("success"));

    const result = runAaveWrite(ACCOUNT, () => Promise.reject(unconfirmed()));
    await flush();

    expect(getPendingAaveWrite(ACCOUNT)).toEqual({
      phase: "unconfirmed",
      hash: HASH,
      stopWaiting: null,
    });
    await vi.advanceTimersByTimeAsync(RECEIPT_RETRY_DELAY_MS);
    await expect(result).resolves.toBe("mined");
  });

  it("keeps the lock when the SDK gives up while a Safe proposal is still pending in the queue", async () => {
    mockWaitReceipt
      .mockRejectedValueOnce(
        new Error(
          `Timed out after 14400000ms waiting for Safe transaction ${HASH} to reach quorum and execute. The proposal is still pending in the Safe queue.`,
        ),
      )
      .mockResolvedValueOnce(receipt("success"));

    const result = runAaveWrite(ACCOUNT, () => Promise.reject(unconfirmed()));
    await flush();

    expect(getPendingAaveWrite(ACCOUNT)).toMatchObject({
      phase: "unconfirmed",
    });
    await vi.advanceTimersByTimeAsync(RECEIPT_RETRY_DELAY_MS);
    await expect(result).resolves.toBe("mined");
  });

  it("rejects with the reverted copy when the late transaction was mined but reverted", async () => {
    mockWaitReceipt.mockResolvedValue(receipt("reverted"));

    const thrown = await runAaveWrite(ACCOUNT, () =>
      Promise.reject(unconfirmed()),
    ).catch((e: unknown) => e);

    expect(thrown).toBeInstanceOf(ContractError);
    expect((thrown as ContractError).code).toBe(ErrorCode.CONTRACT_REVERT);
    expect((thrown as Error).message).toBe(
      COPY.common.unconfirmedTransaction.reverted,
    );
    expect(getPendingAaveWrite(ACCOUNT)).toBeNull();
  });

  it("resolves mined when the nonce has been used by the transaction itself", async () => {
    mockWaitReceipt.mockRejectedValue(
      new WaitForTransactionReceiptTimeoutError({ hash: HASH }),
    );
    mockGetTransactionCount.mockResolvedValue(6);
    mockGetTransactionReceipt.mockResolvedValue(receipt("success"));

    await expect(
      runAaveWrite(ACCOUNT, () => Promise.reject(unconfirmed())),
    ).resolves.toBe("mined");
  });

  it("resolves mined for a wallet speed-up mined after the original left the pool", async () => {
    replacedAtBlock102({ to: BROADCAST.to, input: BROADCAST.data });

    const result = runAaveWrite(ACCOUNT, () => Promise.reject(unconfirmed()));
    await vi.runAllTimersAsync();

    await expect(result).resolves.toBe("mined");
    expect(mockGetBlock).toHaveBeenCalledWith({
      blockNumber: 102n,
      includeTransactions: true,
    });
  });

  it("ends the wait as not executed for a wallet cancel mined after the original left the pool", async () => {
    replacedAtBlock102({ to: ACCOUNT, input: "0x" });

    const result = runAaveWrite(ACCOUNT, () =>
      Promise.reject(unconfirmed()),
    ).catch((e: unknown) => e);
    await vi.runAllTimersAsync();
    const thrown = await result;

    expect(thrown).toBeInstanceOf(TransactionReplacedError);
    expect((thrown as Error).message).toBe(
      COPY.common.unconfirmedTransaction.replaced,
    );
    expect(getPendingAaveWrite(ACCOUNT)).toBeNull();
  });

  it("ends the wait with an unknown outcome when the transaction that used the nonce cannot be found", async () => {
    replacedAtBlock102({ to: BROADCAST.to, input: BROADCAST.data });
    mockGetBlock.mockResolvedValue({ transactions: [] });

    const result = runAaveWrite(ACCOUNT, () =>
      Promise.reject(unconfirmed()),
    ).catch((e: unknown) => e);
    await vi.runAllTimersAsync();
    const thrown = await result;

    expect(thrown).toBeInstanceOf(TransactionReplacedError);
    expect((thrown as Error).message).toBe(
      COPY.common.unconfirmedTransaction.replacedOutcomeUnknown,
    );
  });

  it("keeps waiting when the RPC has not served the block that used the nonce yet", async () => {
    replacedAtBlock102({ to: BROADCAST.to, input: BROADCAST.data });
    mockGetBlock.mockRejectedValueOnce(
      new BlockNotFoundError({ blockNumber: 102n }),
    );

    const result = runAaveWrite(ACCOUNT, () => Promise.reject(unconfirmed()));
    await vi.runAllTimersAsync();

    await expect(result).resolves.toBe("mined");
    expect(mockGetBlock).toHaveBeenCalledTimes(2);
  });

  it("keeps waiting, without searching for a replacement, when a lagging RPC counts the nonce used at a block no later than the send", async () => {
    mockWaitReceipt
      .mockRejectedValueOnce(
        new WaitForTransactionReceiptTimeoutError({ hash: HASH }),
      )
      .mockResolvedValueOnce(receipt("success"));
    // Sent at block 100; the backend answers block 100 with nonce 5 counted.
    mockGetBlockNumber.mockResolvedValue(100n);
    mockGetTransactionCount.mockResolvedValue(6);
    mockGetTransactionReceipt.mockRejectedValue(
      new TransactionReceiptNotFoundError({ hash: HASH }),
    );

    const result = runAaveWrite(ACCOUNT, () => Promise.reject(unconfirmed()));
    await vi.runAllTimersAsync();

    await expect(result).resolves.toBe("mined");
    expect(mockGetBlock).not.toHaveBeenCalled();
  });

  it("ignores the nonce of a transaction another account sent under the broadcast hash", async () => {
    // A relayer's nonce 2 read under the hash, while the account's own mined
    // count is 5: taken as the sent nonce, it would read as used.
    mockWaitReceipt
      .mockRejectedValueOnce(
        new WaitForTransactionReceiptTimeoutError({ hash: HASH }),
      )
      .mockResolvedValueOnce(receipt("success"));
    mockGetTransaction.mockResolvedValue({ from: OTHER_ACCOUNT, nonce: 2 });

    const result = runAaveWrite(ACCOUNT, () =>
      Promise.reject(
        new UnconfirmedTransactionError(
          new ContractError("Repay failed: timed out"),
          { ...BROADCAST, nonce: null },
        ),
      ),
    );
    await flush();
    await vi.advanceTimersByTimeAsync(RECEIPT_RETRY_DELAY_MS);

    await expect(result).resolves.toBe("mined");
    expect(mockGetTransactionCount).not.toHaveBeenCalled();
    expect(mockGetTransactionReceipt).not.toHaveBeenCalled();
  });

  it("keeps waiting, instead of reporting a replacement, when the RPC fails while reading the original's receipt", async () => {
    mockWaitReceipt
      .mockRejectedValueOnce(
        new WaitForTransactionReceiptTimeoutError({ hash: HASH }),
      )
      .mockResolvedValueOnce(receipt("success"));
    mockGetTransactionCount.mockResolvedValue(6);
    mockGetTransactionReceipt.mockRejectedValue(
      new HttpRequestError({ url: "https://rpc.example" }),
    );

    const result = runAaveWrite(ACCOUNT, () => Promise.reject(unconfirmed()));
    await vi.runAllTimersAsync();

    await expect(result).resolves.toBe("mined");
  });

  it("offers to stop waiting only once ten minutes have passed, and stopping releases the lock", async () => {
    // A receipt that never arrives, like a Safe proposal no one executes.
    mockWaitReceipt.mockReturnValue(new Promise(() => {}));

    const result = runAaveWrite(ACCOUNT, () => Promise.reject(unconfirmed()));
    await vi.advanceTimersByTimeAsync(STOP_WAITING_AVAILABLE_AFTER_MS - 1);
    expect(getPendingAaveWrite(ACCOUNT)).toMatchObject({ stopWaiting: null });

    await vi.advanceTimersByTimeAsync(1);
    const pending = getPendingAaveWrite(ACCOUNT);
    expect(pending).toMatchObject({ phase: "unconfirmed", hash: HASH });
    if (pending?.phase !== "unconfirmed" || !pending.stopWaiting) {
      throw new Error("expected the stop-waiting action to be offered");
    }
    pending.stopWaiting();

    await expect(result).resolves.toBe("stopped");
    expect(getPendingAaveWrite(ACCOUNT)).toBeNull();
  });
});
