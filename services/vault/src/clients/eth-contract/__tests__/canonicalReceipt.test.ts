import {
  BlockNotFoundError,
  HttpRequestError,
  TransactionReceiptNotFoundError,
  type Hash,
  type PublicClient,
  type TransactionReceipt,
} from "viem";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { mockWarn } = vi.hoisted(() => ({ mockWarn: vi.fn() }));

vi.mock("@/infrastructure", () => ({
  logger: { warn: mockWarn, error: vi.fn(), info: vi.fn(), event: vi.fn() },
}));

import { ReceiptNotCanonicalError } from "@/utils/errors";

import {
  CANONICAL_RECEIPT_POLL_INTERVAL_MS,
  waitForCanonicalReceipt,
} from "../canonicalReceipt";

const TX_HASH: Hash =
  "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const TIMEOUT_MS = 30_000;

interface Block {
  number: bigint;
  hash: Hash;
  parentHash: Hash;
}

const rpc = {
  getTransactionReceipt: vi.fn(),
  getBlock: vi.fn(),
};
const publicClient = rpc as unknown as PublicClient;

/**
 * The node serves `chain` by number (the chain it follows) and every block,
 * side blocks too, by hash.
 */
function serveBlocks(chain: Block[], sideBlocks: Block[] = []): void {
  rpc.getBlock.mockImplementation(
    async ({
      blockNumber,
      blockHash,
    }: {
      blockNumber?: bigint;
      blockHash?: Hash;
    }) => {
      const found =
        blockNumber !== undefined
          ? chain.find((block) => block.number === blockNumber)
          : [...chain, ...sideBlocks].find((block) => block.hash === blockHash);
      if (!found) throw new BlockNotFoundError({ blockNumber, blockHash });
      return found;
    },
  );
}

function receiptIn(
  block: Block,
  status: "success" | "reverted" = "success",
): TransactionReceipt {
  return {
    transactionHash: TX_HASH,
    blockNumber: block.number,
    blockHash: block.hash,
    status,
  } as unknown as TransactionReceipt;
}

const B10: Block = { number: 10n, hash: "0x10", parentHash: "0x09" };
const B11: Block = { number: 11n, hash: "0x11", parentHash: "0x10" };
const B12: Block = { number: 12n, hash: "0x12", parentHash: "0x11" };
const B13: Block = { number: 13n, hash: "0x13", parentHash: "0x12" };
/** A block at height 10 that the chain no longer follows. */
const ORPHAN10: Block = { number: 10n, hash: "0xdead10", parentHash: "0x09" };

beforeEach(() => {
  vi.useFakeTimers();
  vi.resetAllMocks();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("waitForCanonicalReceipt", () => {
  it("resolves with the re-read receipt once the block two above it descends from the receipt's block", async () => {
    serveBlocks([B10, B11, B12]);
    const first = receiptIn(B10);
    const reread = receiptIn(B10);
    rpc.getTransactionReceipt.mockResolvedValue(reread);

    const result = await waitForCanonicalReceipt({
      publicClient,
      receipt: first,
      confirmations: 3,
      timeoutMs: TIMEOUT_MS,
    });

    expect(result).toBe(reread);
    expect(rpc.getTransactionReceipt).toHaveBeenCalledWith({
      hash: TX_HASH,
    });
  });

  it("reads the block at depth by number and its ancestors by hash", async () => {
    serveBlocks([B10, B11, B12]);
    rpc.getTransactionReceipt.mockResolvedValue(receiptIn(B10));

    await waitForCanonicalReceipt({
      publicClient,
      receipt: receiptIn(B10),
      confirmations: 3,
      timeoutMs: TIMEOUT_MS,
    });

    expect(rpc.getBlock.mock.calls).toEqual([
      [{ blockNumber: 12n }],
      [{ blockHash: "0x11" }],
      [{ blockHash: "0x10" }],
    ]);
  });

  it("keeps polling while the chain is not that deep yet, and resolves once it is", async () => {
    const chain = [B10, B11];
    serveBlocks(chain);
    rpc.getTransactionReceipt.mockResolvedValue(receiptIn(B10));
    let settled = false;
    const wait = waitForCanonicalReceipt({
      publicClient,
      receipt: receiptIn(B10),
      confirmations: 3,
      timeoutMs: TIMEOUT_MS,
    }).finally(() => {
      settled = true;
    });

    await vi.advanceTimersByTimeAsync(0);
    expect(settled).toBe(false);

    chain.push(B12);
    await vi.advanceTimersByTimeAsync(CANONICAL_RECEIPT_POLL_INTERVAL_MS);

    await expect(wait).resolves.toMatchObject({ blockHash: "0x10" });
  });

  it("keeps polling while the RPC does not serve the receipt", async () => {
    serveBlocks([B10, B11, B12]);
    rpc.getTransactionReceipt
      .mockRejectedValueOnce(
        new TransactionReceiptNotFoundError({ hash: TX_HASH }),
      )
      .mockResolvedValue(receiptIn(B10));

    const wait = waitForCanonicalReceipt({
      publicClient,
      receipt: receiptIn(B10),
      confirmations: 3,
      timeoutMs: TIMEOUT_MS,
    });
    await vi.advanceTimersByTimeAsync(CANONICAL_RECEIPT_POLL_INTERVAL_MS);

    await expect(wait).resolves.toMatchObject({ blockHash: "0x10" });
    expect(rpc.getTransactionReceipt).toHaveBeenCalledTimes(2);
  });

  it("does not accept a receipt from a block the chain at depth does not descend from, though the node still serves that block by hash", async () => {
    serveBlocks([B10, B11, B12], [ORPHAN10]);
    // A lagging backend still serves the receipt from the orphaned block.
    rpc.getTransactionReceipt.mockResolvedValue(receiptIn(ORPHAN10));

    const wait = waitForCanonicalReceipt({
      publicClient,
      receipt: receiptIn(ORPHAN10),
      confirmations: 3,
      timeoutMs: TIMEOUT_MS,
    }).catch((error: unknown) => error);
    await vi.advanceTimersByTimeAsync(TIMEOUT_MS);

    expect(await wait).toBeInstanceOf(ReceiptNotCanonicalError);
  });

  it("resolves with the receipt of the transaction mined again in a later block, with that receipt's status", async () => {
    serveBlocks([B10, B11, B12, B13]);
    rpc.getTransactionReceipt.mockResolvedValue(receiptIn(B11, "reverted"));

    const result = await waitForCanonicalReceipt({
      publicClient,
      receipt: receiptIn(ORPHAN10),
      confirmations: 3,
      timeoutMs: TIMEOUT_MS,
    });

    expect(result).toMatchObject({
      blockNumber: 11n,
      blockHash: "0x11",
      status: "reverted",
    });
  });

  it("warns when the transaction was mined again in another block", async () => {
    serveBlocks([B10, B11, B12, B13]);
    rpc.getTransactionReceipt.mockResolvedValue(receiptIn(B11));

    await waitForCanonicalReceipt({
      publicClient,
      receipt: receiptIn(ORPHAN10),
      confirmations: 3,
      timeoutMs: TIMEOUT_MS,
    });

    expect(mockWarn).toHaveBeenCalledWith(
      "A transaction was mined again after a reorganization",
      {
        data: {
          hash: TX_HASH,
          firstBlockHash: "0xdead10",
          blockHash: "0x11",
          blockNumber: "11",
          status: "success",
        },
      },
    );
  });

  it("does not warn when the receipt is still in its first block", async () => {
    serveBlocks([B10, B11, B12]);
    rpc.getTransactionReceipt.mockResolvedValue(receiptIn(B10));

    await waitForCanonicalReceipt({
      publicClient,
      receipt: receiptIn(B10),
      confirmations: 3,
      timeoutMs: TIMEOUT_MS,
    });

    expect(mockWarn).not.toHaveBeenCalled();
  });

  it("keeps polling through an RPC failure", async () => {
    serveBlocks([B10, B11, B12]);
    rpc.getTransactionReceipt
      .mockRejectedValueOnce(
        new HttpRequestError({ url: "https://rpc.example" }),
      )
      .mockResolvedValue(receiptIn(B10));

    const wait = waitForCanonicalReceipt({
      publicClient,
      receipt: receiptIn(B10),
      confirmations: 3,
      timeoutMs: TIMEOUT_MS,
    });
    await vi.advanceTimersByTimeAsync(CANONICAL_RECEIPT_POLL_INTERVAL_MS);

    await expect(wait).resolves.toMatchObject({ blockHash: "0x10" });
  });

  it("rejects with ReceiptNotCanonicalError carrying the last RPC failure once the time budget is spent", async () => {
    const failure = new HttpRequestError({ url: "https://rpc.example" });
    rpc.getTransactionReceipt.mockRejectedValue(failure);

    const wait = waitForCanonicalReceipt({
      publicClient,
      receipt: receiptIn(B10),
      confirmations: 3,
      timeoutMs: TIMEOUT_MS,
    }).catch((error: unknown) => error);
    await vi.advanceTimersByTimeAsync(TIMEOUT_MS);

    const thrown = await wait;
    expect(thrown).toBeInstanceOf(ReceiptNotCanonicalError);
    expect((thrown as ReceiptNotCanonicalError).hash).toBe(TX_HASH);
    expect((thrown as Error).cause).toBe(failure);
  });

  it("rejects, never resolving with the receipt it was given, when the RPC stops serving the transaction", async () => {
    serveBlocks([B10, B11, B12]);
    rpc.getTransactionReceipt.mockRejectedValue(
      new TransactionReceiptNotFoundError({ hash: TX_HASH }),
    );

    const wait = waitForCanonicalReceipt({
      publicClient,
      receipt: receiptIn(B10),
      confirmations: 3,
      timeoutMs: TIMEOUT_MS,
    }).catch((error: unknown) => error);
    await vi.advanceTimersByTimeAsync(TIMEOUT_MS);

    const thrown = await wait;
    expect(thrown).toBeInstanceOf(ReceiptNotCanonicalError);
    expect((thrown as Error).cause).toBeUndefined();
  });

  it("rejects with the signal's reason when stopped between polls", async () => {
    serveBlocks([B10]);
    rpc.getTransactionReceipt.mockResolvedValue(receiptIn(B10));
    const stop = new AbortController();
    const reason = new Error("stopped");

    const wait = waitForCanonicalReceipt({
      publicClient,
      receipt: receiptIn(B10),
      confirmations: 3,
      timeoutMs: TIMEOUT_MS,
      signal: stop.signal,
    }).catch((error: unknown) => error);
    await vi.advanceTimersByTimeAsync(0);
    stop.abort(reason);

    expect(await wait).toBe(reason);
  });

  it("rejects with the signal's reason, not the receipt, when stopped while a poll's reads ran", async () => {
    serveBlocks([B10, B11, B12]);
    const stop = new AbortController();
    const reason = new Error("stopped");
    rpc.getTransactionReceipt.mockImplementation(async () => {
      stop.abort(reason);
      return receiptIn(B10);
    });

    const outcome = await waitForCanonicalReceipt({
      publicClient,
      receipt: receiptIn(B10),
      confirmations: 3,
      timeoutMs: TIMEOUT_MS,
      signal: stop.signal,
    }).catch((error: unknown) => error);

    expect(outcome).toBe(reason);
  });

  it("refuses a depth below one block", async () => {
    await expect(
      waitForCanonicalReceipt({
        publicClient,
        receipt: receiptIn(B10),
        confirmations: 0,
        timeoutMs: TIMEOUT_MS,
      }),
    ).rejects.toThrow("confirmations must be a positive integer, got 0");
    expect(rpc.getTransactionReceipt).not.toHaveBeenCalled();
  });
});
