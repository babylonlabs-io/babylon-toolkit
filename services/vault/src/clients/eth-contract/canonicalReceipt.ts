/**
 * Waits until a mined transaction is buried under enough blocks of the chain
 * the app's RPC follows, re-reading its receipt on every poll.
 *
 * A receipt says the transaction was mined in one block, not that the block
 * stayed on the chain. viem's receipt wait reads it once and then only counts
 * block numbers against that copy, even with `confirmations` set, so it
 * resolves for a transaction whose block was reorganized out (viem 2.38.2
 * `actions/public/waitForTransactionReceipt.ts`). A reorganized-out
 * transaction usually returns to the pool and is mined again in a later
 * block, with the outcome it has there, which can differ. If it is never mined
 * again, the receipt reported something that did not happen.
 *
 * So the depth is checked from blocks, not from the tip's number. The block
 * `confirmations - 1` above the receipt's is read by number, which is the
 * chain the node follows at that height, and its ancestors are followed by
 * hash down to the receipt's height. A hash names exactly one block, so the
 * check cannot pass on a chain spliced from load-balanced backends on
 * different forks, and a node one or two blocks behind fails it only until it
 * catches up. Reading the receipt's own block by hash would prove nothing: a
 * node also serves blocks it no longer follows by hash.
 */

import {
  BlockNotFoundError,
  TransactionReceiptNotFoundError,
  type Hash,
  type PublicClient,
  type TransactionReceipt,
} from "viem";

import { logger } from "@/infrastructure";
import { abortableSleep } from "@/utils/async";
import { ReceiptNotCanonicalError } from "@/utils/errors";

/** Pause between re-reads: half a 12 s slot, so a new block is seen soon after it lands. */
export const CANONICAL_RECEIPT_POLL_INTERVAL_MS = 6_000;

function isSameHash(a: Hash, b: Hash): boolean {
  return a.toLowerCase() === b.toLowerCase();
}

/** The RPC does not serve the receipt or block yet: lag, or not that deep yet. */
function isNotServedYet(error: unknown): boolean {
  return (
    error instanceof TransactionReceiptNotFoundError ||
    error instanceof BlockNotFoundError
  );
}

/**
 * True when the block `confirmations - 1` above `receipt`'s, on the chain the
 * node follows at that height, descends from the receipt's block.
 *
 * @throws BlockNotFoundError when the chain is not that long yet.
 */
async function isBuried(
  publicClient: PublicClient,
  receipt: TransactionReceipt,
  confirmations: number,
): Promise<boolean> {
  let block = await publicClient.getBlock({
    blockNumber: receipt.blockNumber + BigInt(confirmations - 1),
  });
  for (let above = confirmations - 1; above > 0; above--) {
    block = await publicClient.getBlock({ blockHash: block.parentHash });
  }
  return isSameHash(block.hash, receipt.blockHash);
}

/**
 * Re-read `receipt`'s transaction until it is `confirmations` blocks deep
 * (its own block counts as one) on the chain the RPC follows.
 *
 * Resolves with the receipt as re-read, never with the one passed in. After a
 * reorganization that is the transaction's receipt in the block it was mined
 * in again, and its status can differ from the first one's.
 *
 * @throws ReceiptNotCanonicalError when it is not that deep within
 *   `timeoutMs`; the last RPC failure, if any, is its cause.
 * @throws the signal's reason when `signal` is aborted.
 */
export async function waitForCanonicalReceipt({
  publicClient,
  receipt,
  confirmations,
  timeoutMs,
  signal,
}: {
  publicClient: PublicClient;
  receipt: TransactionReceipt;
  confirmations: number;
  timeoutMs: number;
  signal?: AbortSignal;
}): Promise<TransactionReceipt> {
  if (!Number.isInteger(confirmations) || confirmations < 1) {
    throw new Error(
      `confirmations must be a positive integer, got ${confirmations}`,
    );
  }

  const hash = receipt.transactionHash;
  const deadline = Date.now() + timeoutMs;
  let lastError: unknown;

  for (;;) {
    if (signal?.aborted) throw signal.reason;

    let buried: TransactionReceipt | null = null;
    try {
      const fresh = await publicClient.getTransactionReceipt({ hash });
      if (await isBuried(publicClient, fresh, confirmations)) buried = fresh;
    } catch (error) {
      if (!isNotServedYet(error)) lastError = error;
    }
    // Stopped while this poll's reads ran: the answer has no reader.
    if (signal?.aborted) throw signal.reason;

    if (buried) {
      if (!isSameHash(buried.blockHash, receipt.blockHash)) {
        logger.warn("A transaction was mined again after a reorganization", {
          data: {
            hash,
            firstBlockHash: receipt.blockHash,
            blockHash: buried.blockHash,
            blockNumber: buried.blockNumber.toString(),
            status: buried.status,
          },
        });
      }
      return buried;
    }

    const remaining = deadline - Date.now();
    if (remaining <= 0) {
      throw new ReceiptNotCanonicalError({
        hash,
        confirmations,
        timeoutMs,
        cause: lastError,
      });
    }
    await abortableSleep(
      Math.min(CANONICAL_RECEIPT_POLL_INTERVAL_MS, remaining),
      signal,
    );
  }
}
