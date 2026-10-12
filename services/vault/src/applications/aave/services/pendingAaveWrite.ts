/**
 * One Aave write at a time per account, held until its outcome is known.
 *
 * A broadcast transaction whose receipt wait ends without an answer can still
 * be mined. Reporting it as failed unlocked the form, so the same borrow could
 * be signed again with the next nonce and both were mined. Here the write
 * keeps the lock instead: the wait goes on in rounds, and between rounds a
 * nonce check catches a replacement the wallet made (a speed-up or a cancel)
 * and finds the transaction that replaced it. Every loan and collateral form
 * reads the lock, so closing and reopening a form, or opening another one,
 * cannot send a second transaction meanwhile. Only a definite answer ends
 * the write as a failure: a receipt that says reverted, or the SDK reporting
 * that a Safe transaction executed and reverted. Any other failed wait,
 * including a Safe Transaction Service error, keeps the lock.
 *
 * Module-scoped and in memory only. A form unmounting must not drop the lock,
 * and the wait keeps running after it. A reload does drop it: nothing here is
 * persisted, and `assertNoTransactionInFlight` covers a reload while the
 * transaction is still in a public mempool. A transaction the wallet drops
 * without replacing it is never mined, and neither is a Safe proposal no one
 * executes, so the wait may not end on its own: the user can stop waiting once
 * STOP_WAITING_AVAILABLE_AFTER_MS passes, or at once when the wait fails in a
 * way another round cannot fix.
 */

import { waitForTransactionReceiptSmartAware } from "@babylonlabs-io/ts-sdk/tbv/core/utils";
import {
  TransactionReceiptNotFoundError,
  type Address,
  type Hash,
  type PublicClient,
  type TransactionReceipt,
} from "viem";
import { getTransactionCount } from "viem/actions";

import { ethClient } from "@/clients/eth-contract/client";
import {
  REPLACEMENT_LOOKUP_TIMEOUT_MS,
  assertReceiptIsForSentCall,
  findReceiptForNonce,
} from "@/clients/eth-contract/transactionReplacement";
import { WALLET_NONCE_POLL_INTERVAL_MS } from "@/clients/eth-contract/walletNonce";
import { COPY } from "@/copy";
import { logger } from "@/infrastructure";
import { TELEMETRY_EVENT } from "@/infrastructure/telemetryEvents";
import { abortableSleep } from "@/utils/async";
import {
  ContractError,
  ErrorCode,
  TransactionReplacedError,
  UnconfirmedTransactionError,
  WriteInProgressError,
  isDefinitiveReceiptWaitFailure,
  isTransientReceiptWaitError,
  type BroadcastTransaction,
  type UnconfirmedBroadcast,
} from "@/utils/errors";

import {
  RECEIPT_RETRY_DELAY_MS,
  RECEIPT_WAIT_ROUND_MS,
  STOP_WAITING_AVAILABLE_AFTER_MS,
} from "../constants";

/** A broadcast transaction still being waited on after the normal receipt wait. */
export interface UnconfirmedAaveWrite {
  phase: "unconfirmed";
  hash: Hash;
  /** Ends the wait and releases the lock. Null until it is offered. */
  stopWaiting: (() => void) | null;
}

export type PendingAaveWrite =
  /** The pre-sign checks, signing, broadcasting, or the normal receipt wait. */
  { phase: "submitting" } | UnconfirmedAaveWrite;

/** `stopped`: the user stopped waiting, and the transaction may still be mined. */
export type AaveWriteOutcome = "mined" | "stopped";

/**
 * How a borrow or repay ended, for the form that started it. `failed`: it did
 * not take effect (refused, rejected, reverted or canceled). `unknown`: it may
 * still take effect (the user stopped waiting, or the wallet replaced it with
 * a transaction that could not be read), so the form must not offer the same
 * amount again as if nothing happened.
 */
export type AaveActionResult = "succeeded" | "failed" | "unknown";

const SUBMITTING: PendingAaveWrite = { phase: "submitting" };

const writes = new Map<string, PendingAaveWrite>();
const listeners = new Set<() => void>();

function keyOf(account: Address): string {
  return account.toLowerCase();
}

function isSameAddress(a: Address, b: Address): boolean {
  return a.toLowerCase() === b.toLowerCase();
}

function publish(key: string, write: PendingAaveWrite | null): void {
  if (write) {
    writes.set(key, write);
  } else {
    writes.delete(key);
  }
  for (const listener of listeners) listener();
}

/**
 * Stable-identity snapshot for `useSyncExternalStore`: every change replaces
 * the account's entry, and an unchanged read returns the same object.
 */
export function getPendingAaveWrite(account: Address): PendingAaveWrite | null {
  return writes.get(keyOf(account)) ?? null;
}

export function subscribeToPendingAaveWrites(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Run one Aave write for `account` while holding the account's lock. Callers
 * pass the pre-sign checks inside `write`, so a second call made while they
 * run is refused rather than sent after the first.
 *
 * Resolves `mined` once the write's transaction is mined, late included, and
 * `stopped` when the user stops waiting on an unconfirmed one.
 *
 * @throws WriteInProgressError when another write for `account` holds the
 *   lock.
 * @throws ContractError when the write fails before or without broadcasting,
 *   when its transaction reverts, or when the wallet replaced it.
 */
export async function runAaveWrite(
  account: Address,
  write: () => Promise<unknown>,
): Promise<AaveWriteOutcome> {
  const key = keyOf(account);
  if (writes.has(key)) {
    throw new WriteInProgressError();
  }

  publish(key, SUBMITTING);
  try {
    await write();
    return "mined";
  } catch (error) {
    if (!(error instanceof UnconfirmedTransactionError)) throw error;
    return await waitForOutcome(key, error.broadcast);
  } finally {
    publish(key, null);
  }
}

async function waitForOutcome(
  key: string,
  broadcast: UnconfirmedBroadcast,
): Promise<AaveWriteOutcome> {
  logger.event(TELEMETRY_EVENT.LOAN_WRITE_UNCONFIRMED, { category: "aave" });

  const stop = new AbortController();
  const stopped = new Promise<"stopped">((resolve) => {
    stop.signal.addEventListener("abort", () => resolve("stopped"), {
      once: true,
    });
  });

  publish(key, {
    phase: "unconfirmed",
    hash: broadcast.hash,
    stopWaiting: null,
  });
  let offered = false;
  const offerStop = () => {
    if (offered || stop.signal.aborted) return;
    offered = true;
    publish(key, {
      phase: "unconfirmed",
      hash: broadcast.hash,
      stopWaiting: () => stop.abort(),
    });
  };
  const offerTimer = setTimeout(offerStop, STOP_WAITING_AVAILABLE_AFTER_MS);
  try {
    return await Promise.race([
      waitUntilMined(broadcast, stop.signal, offerStop),
      stopped,
    ]);
  } finally {
    clearTimeout(offerTimer);
    // Ends the wait after it lost the race to "stop waiting".
    stop.abort();
  }
}

async function waitUntilMined(
  broadcast: UnconfirmedBroadcast,
  signal: AbortSignal,
  offerStop: () => void,
): Promise<"mined"> {
  const publicClient = ethClient.getPublicClient();
  let sentNonce = broadcast.nonce;
  // A block where the nonce was not yet used: where the search for the
  // transaction that used it starts.
  let unusedAtBlock = broadcast.sentAtBlock;

  for (;;) {
    const receipt = await waitForTransactionReceiptSmartAware({
      publicClient,
      walletAddress: broadcast.from,
      hash: broadcast.hash,
      timeout: RECEIPT_WAIT_ROUND_MS,
      // The SDK ignores `timeout` while it polls the Safe Transaction Service;
      // without its own bound a Safe round, and a round left running after
      // "Stop waiting", would poll for the SDK's whole default budget.
      safePollTimeoutMs: RECEIPT_WAIT_ROUND_MS,
    }).catch((error: unknown) => {
      // A Safe transaction that executed and reverted is an answer: it ends
      // the wait as a failure. Anything else leaves the outcome unknown.
      if (isDefinitiveReceiptWaitFailure(error)) throw error;
      logger.warn("An unconfirmed Aave transaction is still not mined", {
        data: { error: error instanceof Error ? error.message : String(error) },
      });
      // Another round cannot answer this one (for example, the Safe
      // Transaction Service refused the request), so the user may stop
      // waiting at once. The lock holds until they do.
      if (!isTransientReceiptWaitError(error)) offerStop();
      return null;
    });
    // Stopped while this round ran: the outcome no longer has a reader.
    if (signal.aborted) throw signal.reason;
    if (receipt) return settle(publicClient, receipt, broadcast);

    // Only while the original is still in the node's pool; a replacement
    // drops it. The nonce counts only if the account sent it.
    sentNonce ??= await publicClient
      .getTransaction({ hash: broadcast.hash })
      .then(
        (transaction) =>
          isSameAddress(transaction.from, broadcast.from)
            ? transaction.nonce
            : null,
        () => null,
      );
    if (sentNonce !== null) {
      const usage = await readNonceUsage(
        publicClient,
        broadcast.from,
        sentNonce,
      );
      if (usage?.used) {
        const outcome = await settleUsedNonce(publicClient, broadcast, {
          nonce: sentNonce,
          unusedAtBlock,
          usedAtBlock: usage.atBlock,
        });
        if (outcome) return outcome;
      } else if (usage) {
        unusedAtBlock = usage.atBlock;
      }
    }

    await abortableSleep(RECEIPT_RETRY_DELAY_MS, signal);
  }
}

/**
 * Whether the account's mined count at the latest block has passed `nonce`,
 * with that block. Null when the RPC could not answer.
 */
async function readNonceUsage(
  publicClient: PublicClient,
  account: Address,
  nonce: number,
): Promise<{ used: boolean; atBlock: bigint } | null> {
  const atBlock = await publicClient.getBlockNumber().catch(() => null);
  if (atBlock === null) return null;
  const count = await getTransactionCount(publicClient, {
    address: account,
    blockNumber: atBlock,
  }).catch(() => null);
  if (count === null) return null;
  return { used: count > nonce, atBlock };
}

/**
 * The broadcast transaction's nonce was used: by the transaction itself, or by
 * a wallet replacement, which is then found and judged by its call. Null when
 * the RPC could not answer, so the wait goes on.
 *
 * @throws TransactionReplacedError when the block that used the nonce was read
 *   and holds no transaction from the account with it, when no block is known
 *   where the nonce was still unused, or when the replacement was not a
 *   speed-up of the same call.
 */
async function settleUsedNonce(
  publicClient: PublicClient,
  broadcast: UnconfirmedBroadcast,
  {
    nonce,
    unusedAtBlock,
    usedAtBlock,
  }: { nonce: number; unusedAtBlock: bigint | null; usedAtBlock: bigint },
): Promise<"mined" | null> {
  const own = await readOwnReceipt(publicClient, broadcast.hash);
  if (own === "unreadable") return null;
  if (own !== "absent") return settle(publicClient, own, broadcast);

  // Only when the block-number read failed right after the send and every
  // later read already saw the nonce used: there is no range to search.
  if (unusedAtBlock === null) {
    throw new TransactionReplacedError("unknown", broadcast.hash);
  }
  // A lagging backend answered with a block behind one already seen with the
  // nonce unused; a later round reads a current block.
  if (usedAtBlock <= unusedAtBlock) return null;

  const replacement = await findReceiptForNonce(publicClient, {
    from: broadcast.from,
    nonce,
    unusedAtBlock,
    usedAtBlock,
  }).catch((error: unknown) => {
    logger.warn("Could not search for the transaction that used the nonce", {
      data: { error: error instanceof Error ? error.message : String(error) },
    });
    return "unreadable" as const;
  });
  if (replacement === "unreadable") return null;
  if (replacement === null) {
    throw new TransactionReplacedError("unknown", broadcast.hash);
  }
  return settle(publicClient, replacement, broadcast);
}

/**
 * The broadcast transaction's receipt, retried briefly: a lagging RPC backend
 * can count the nonce before it serves the receipt. `absent` when every read
 * found none; `unreadable` when the last read failed for another reason.
 */
async function readOwnReceipt(
  publicClient: PublicClient,
  hash: Hash,
): Promise<TransactionReceipt | "absent" | "unreadable"> {
  const deadline = Date.now() + REPLACEMENT_LOOKUP_TIMEOUT_MS;
  for (;;) {
    const read = await publicClient
      .getTransactionReceipt({ hash })
      .catch((error: unknown) =>
        error instanceof TransactionReceiptNotFoundError
          ? ("absent" as const)
          : ("unreadable" as const),
      );
    if (typeof read !== "string") return read;
    if (Date.now() >= deadline) return read;
    await abortableSleep(WALLET_NONCE_POLL_INTERVAL_MS);
  }
}

async function settle(
  publicClient: PublicClient,
  receipt: TransactionReceipt,
  broadcast: BroadcastTransaction,
): Promise<"mined"> {
  await assertReceiptIsForSentCall({ publicClient, receipt, sent: broadcast });
  if (receipt.status === "reverted") {
    throw new ContractError(
      COPY.common.unconfirmedTransaction.reverted,
      ErrorCode.CONTRACT_REVERT,
      receipt.transactionHash,
    );
  }
  return "mined";
}
