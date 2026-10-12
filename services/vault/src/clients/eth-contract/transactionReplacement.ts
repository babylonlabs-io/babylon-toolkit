/**
 * Recognizes a wallet replacement of a sent transaction: a speed-up or a
 * cancel, sent with the same nonce.
 *
 * viem's receipt wait follows a replacement only while it holds the original
 * transaction, and only for the block it is looking at. The node drops the
 * original from its pool once the wallet replaces it, so a wait started after
 * that never follows the replacement, and the original's nonce can no longer
 * be read from its hash. So the nonce is read right after the send, and a
 * replacement is found by sender and nonce in the blocks where that nonce was
 * used.
 *
 * When viem does follow a replacement it resolves with the replacement's
 * receipt, and a cancel's receipt has status "success" too. The SDK's
 * smart-account-aware wait does not pass viem's `onReplaced`, so a hash that
 * differs from the sent one is the only sign. A speed-up repeats the same call
 * and stands for the sent one. Any other replacement used the nonce, so the
 * sent call can never be mined.
 */

import type { Address, Hash, PublicClient, TransactionReceipt } from "viem";
import { getTransactionCount } from "viem/actions";

import {
  TransactionReplacedError,
  type BroadcastTransaction,
} from "@/utils/errors";

import { readTransaction } from "./walletNonce";

/**
 * How long to keep reading a transaction that a lagging RPC backend has not
 * served yet: one 12 s slot, plus margin for a backend a block behind the one
 * that accepted or mined it.
 */
export const REPLACEMENT_LOOKUP_TIMEOUT_MS = 15_000;

function isSameAddress(a: Address, b: Address): boolean {
  return a.toLowerCase() === b.toLowerCase();
}

/**
 * The sent transaction's nonce and the block the chain was at, read from the
 * app's RPC right after the send, while the original is still in the node's
 * pool. The nonce is kept only when `from` sent the transaction: a hash some
 * other account sent (a relayer) carries that account's nonce. Never rejects;
 * a value it could not read is null.
 */
export function readBroadcastPosition(
  publicClient: PublicClient,
  hash: Hash,
  from: Address,
): Promise<{ nonce: number | null; sentAtBlock: bigint | null }> {
  // Started at the send and awaited only if the receipt wait ends without an
  // answer, so it must never reject: a rejection nobody awaits is unhandled.
  return Promise.resolve()
    .then(() =>
      Promise.all([
        readTransaction(
          publicClient,
          hash,
          Date.now() + REPLACEMENT_LOOKUP_TIMEOUT_MS,
        ).catch(() => ({ transaction: null })),
        publicClient.getBlockNumber().catch(() => null),
      ]),
    )
    .then(([read, sentAtBlock]) => ({
      nonce:
        read.transaction !== null && isSameAddress(read.transaction.from, from)
          ? read.transaction.nonce
          : null,
      sentAtBlock,
    }))
    .catch(() => ({ nonce: null, sentAtBlock: null }));
}

/**
 * The receipt of the transaction `from` mined with `nonce`, found in the
 * blocks after `unusedAtBlock` (where the account's mined count had not
 * passed `nonce`) up to `usedAtBlock` (where it had). A binary search on the
 * account's count narrows it to one block, which is then read whole. Null when
 * that block holds no such transaction.
 */
export async function findReceiptForNonce(
  publicClient: PublicClient,
  {
    from,
    nonce,
    unusedAtBlock,
    usedAtBlock,
  }: {
    from: Address;
    nonce: number;
    unusedAtBlock: bigint;
    usedAtBlock: bigint;
  },
): Promise<TransactionReceipt | null> {
  let low = unusedAtBlock;
  let high = usedAtBlock;
  while (high - low > 1n) {
    const middle = (low + high) / 2n;
    const count = await getTransactionCount(publicClient, {
      address: from,
      blockNumber: middle,
    });
    if (count > nonce) {
      high = middle;
    } else {
      low = middle;
    }
  }

  const block = await publicClient.getBlock({
    blockNumber: high,
    includeTransactions: true,
  });
  const mined = block.transactions.find(
    (transaction) =>
      isSameAddress(transaction.from, from) && transaction.nonce === nonce,
  );
  if (!mined) return null;
  return publicClient.getTransactionReceipt({ hash: mined.hash });
}

/**
 * @throws TransactionReplacedError when `receipt` is for a replacement other
 *   than a speed-up of the sent call, or for a replacement the RPC would not
 *   serve before REPLACEMENT_LOOKUP_TIMEOUT_MS.
 */
export async function assertReceiptIsForSentCall({
  publicClient,
  receipt,
  sent,
}: {
  publicClient: PublicClient;
  receipt: Pick<TransactionReceipt, "from" | "transactionHash">;
  sent: BroadcastTransaction;
}): Promise<void> {
  if (receipt.transactionHash.toLowerCase() === sent.hash.toLowerCase()) return;
  // A Safe's receipt is for the transaction its executor sent, never for the
  // proposal hash, so a different hash says nothing about a replacement there.
  if (!isSameAddress(receipt.from, sent.from)) return;

  const read = await readTransaction(
    publicClient,
    receipt.transactionHash,
    Date.now() + REPLACEMENT_LOOKUP_TIMEOUT_MS,
  );
  if (read.transaction === null) {
    throw new TransactionReplacedError("unknown", sent.hash);
  }
  const { to, input } = read.transaction;
  const isSpeedUp =
    to !== null &&
    to.toLowerCase() === sent.to.toLowerCase() &&
    input.toLowerCase() === sent.data.toLowerCase();
  if (!isSpeedUp) {
    throw new TransactionReplacedError("not-executed", sent.hash);
  }
}
