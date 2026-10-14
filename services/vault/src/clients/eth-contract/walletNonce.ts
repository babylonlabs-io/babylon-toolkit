/**
 * Keeps back-to-back wallet transactions from reusing a nonce.
 *
 * The app decides a transaction is mined from its own RPC, but the wallet
 * picks the next nonce from its own node. MetaMask reads that account's
 * transaction count at the latest block its block tracker has polled, about
 * every 20 s, so right after a transaction mines it can still hand out the
 * nonce that transaction used. The node then rejects the next send with
 * "nonce too low" before broadcasting it
 * (https://github.com/babylonlabs-io/babylon-toolkit/issues/2514).
 *
 * The app never sets the nonce itself: the wallet also counts transactions
 * other dApps have pending, a user can edit it in the wallet, and smart
 * accounts ignore it.
 */

import {
  type Address,
  type Hash,
  type PublicClient,
  type Transaction,
  type TransactionReceipt,
  type WalletClient,
  withTimeout,
} from "viem";
import { getTransactionCount, getTransactionReceipt } from "viem/actions";

import { logger } from "@/infrastructure";
import { abortableSleep } from "@/utils/async";
import { classifyError, SendOutcomeUnknownError } from "@/utils/errors";
import {
  readRejectedNonce,
  type RejectedNonce,
} from "@/utils/errors/rejectedNonce";

import { singleSubmissionWalletClient } from "./walletSubmission";

/** How often the wallet's transaction count is read while waiting. */
export const WALLET_NONCE_POLL_INTERVAL_MS = 1_000;

/**
 * How long to wait for the wallet's node to count a transaction: MetaMask's
 * 20 s block poll, plus a slow block and the wallet's own round trips.
 */
export const WALLET_NONCE_SYNC_TIMEOUT_MS = 45_000;

export type WalletNonceSync =
  | { status: "synced"; waitedMs: number; walletCount: number }
  /** `walletCount` is null when no count read answered before the deadline. */
  | { status: "timeout"; waitedMs: number; walletCount: number | null }
  /** The wallet's provider rejected the count read (some do not serve reads). */
  | { status: "unavailable"; waitedMs: number; error: string };

/**
 * Raised inside this module when a read does not answer before the wait's
 * deadline. The wallet transport has no request timeout of its own, so a
 * wallet that never answers would otherwise hold the caller forever.
 */
class ReadDeadlineError extends Error {
  constructor() {
    super("read did not answer before the wallet wait's deadline");
    this.name = "ReadDeadlineError";
  }
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Run `read`, rejecting with ReadDeadlineError once `deadline` passes. */
function readBefore<T>(deadline: number, read: () => Promise<T>): Promise<T> {
  const remainingMs = deadline - Date.now();
  if (remainingMs <= 0) return Promise.reject(new ReadDeadlineError());
  return withTimeout(read, {
    timeout: remainingMs,
    errorInstance: new ReadDeadlineError(),
  });
}

/**
 * Wait until the wallet's provider counts at least `minimumCount` transactions
 * from `account` at its latest block, or until `timeoutMs` passes.
 *
 * Reads through the wallet client, so the answer comes from the node the
 * wallet picks nonces from, and at `latest`, the block MetaMask pins that
 * read to. `pending` would skip MetaMask's block pin and report caught up too
 * early. Every read is bounded by the deadline.
 *
 * `nudgeHash`: asking MetaMask for a receipt from a block newer than the one
 * it last polled makes it poll again at once, so the wait usually ends well
 * inside the 20 s poll. A failed nudge is ignored; the count read decides.
 */
export async function waitForWalletNonce({
  walletClient,
  account,
  minimumCount,
  nudgeHash,
  timeoutMs = WALLET_NONCE_SYNC_TIMEOUT_MS,
}: {
  walletClient: WalletClient;
  account: Address;
  minimumCount: number;
  nudgeHash?: Hash;
  timeoutMs?: number;
}): Promise<WalletNonceSync> {
  const startedAt = Date.now();
  const deadline = startedAt + timeoutMs;
  let walletCount: number | null = null;
  for (;;) {
    if (nudgeHash) {
      await readBefore(deadline, () =>
        getTransactionReceipt(walletClient, { hash: nudgeHash }),
      ).catch(() => undefined);
    }

    try {
      walletCount = await readBefore(deadline, () =>
        getTransactionCount(walletClient, {
          address: account,
          blockTag: "latest",
        }),
      );
    } catch (error) {
      const waitedMs = Date.now() - startedAt;
      if (error instanceof ReadDeadlineError) {
        return { status: "timeout", waitedMs, walletCount };
      }
      return { status: "unavailable", waitedMs, error: errorText(error) };
    }

    if (walletCount >= minimumCount) {
      return {
        status: "synced",
        waitedMs: Date.now() - startedAt,
        walletCount,
      };
    }
    // Past the deadline the sleep resolves at once, and the next read rejects
    // with ReadDeadlineError, which returns `timeout` with this count.
    await abortableSleep(
      Math.min(WALLET_NONCE_POLL_INTERVAL_MS, deadline - Date.now()),
    );
  }
}

/**
 * Read a transaction from the app's RPC, retrying until `deadline`: a
 * load-balanced backend can briefly miss a transaction another backend just
 * accepted or returned the receipt for. Null when no read found it in time.
 */
export async function readTransaction(
  publicClient: PublicClient,
  hash: Hash,
  deadline: number,
): Promise<
  { transaction: Transaction } | { transaction: null; error: string }
> {
  for (;;) {
    try {
      const transaction = await readBefore(deadline, () =>
        publicClient.getTransaction({ hash }),
      );
      return { transaction };
    } catch (error) {
      const remainingMs = deadline - Date.now();
      if (remainingMs <= 0) {
        return { transaction: null, error: errorText(error) };
      }
      await abortableSleep(
        Math.min(WALLET_NONCE_POLL_INTERVAL_MS, remainingMs),
      );
    }
  }
}

/**
 * After a transaction mined (reverted included, since a revert still uses the
 * nonce), wait for the wallet's node to count it, so the next transaction the
 * flow requests gets the next nonce.
 *
 * Skipped when the connected account did not send the transaction: a Safe's
 * transaction is sent by whoever executes it, and its nonce is not the
 * wallet's. Never throws and never waits past WALLET_NONCE_SYNC_TIMEOUT_MS in
 * total: the transaction is already mined, so a wait that cannot finish is
 * logged and the caller carries on.
 */
export async function waitForWalletToCountTransaction({
  walletClient,
  publicClient,
  account,
  receipt,
}: {
  walletClient: WalletClient;
  publicClient: PublicClient;
  account: Address;
  receipt: Pick<TransactionReceipt, "from" | "transactionHash">;
}): Promise<void> {
  if (receipt.from.toLowerCase() !== account.toLowerCase()) return;

  const hash = receipt.transactionHash;
  const startedAt = Date.now();
  const deadline = startedAt + WALLET_NONCE_SYNC_TIMEOUT_MS;
  const mined = await readTransaction(publicClient, hash, deadline);
  if (mined.transaction === null) {
    logger.warn("Could not read a mined transaction to wait for the wallet", {
      data: { hash, waitedMs: Date.now() - startedAt, error: mined.error },
    });
    return;
  }

  const sync = await waitForWalletNonce({
    walletClient,
    account,
    minimumCount: mined.transaction.nonce + 1,
    nudgeHash: hash,
    timeoutMs: deadline - Date.now(),
  });
  if (sync.status === "synced") return;

  logger.warn("The wallet had not counted a mined transaction", {
    data: {
      chainId: walletClient.chain?.id,
      hash,
      minedNonce: mined.transaction.nonce,
      ...sync,
    },
  });
}

/**
 * True when a "nonce too low" refusal proves its transaction can never be
 * mined: it names a nonce below `countBeforeSigning`, a count the app RPC
 * served before the wallet was asked to sign (see sendWithStaleNonceRetry).
 */
function provesNeverMined(
  rejected: RejectedNonce | null,
  countBeforeSigning: number | null,
): boolean {
  return (
    rejected !== null &&
    countBeforeSigning !== null &&
    rejected.nonce < countBeforeSigning
  );
}

/**
 * Send a transaction, and send it once more if the wallet signed it with a
 * nonce the chain had already used before this send started.
 *
 * "Nonce too low" only says the nonce is used. That is safe to retry when an
 * earlier transaction used it, since the rejected one can then never be mined;
 * it is not safe when this same transaction was broadcast and mined anyway,
 * which happens when the wallet retries a broadcast whose answer it lost and
 * the retry reaches a node that has already mined it. Transaction counts
 * cannot tell the two apart: the app's RPC and the wallet's node can both
 * still count the account as it was before the send.
 *
 * So the retry needs the rejected transaction's own nonce, which geth and Reth
 * name in their refusal (see rejectedNonce.ts), to be below the account's
 * count the app RPC served before the wallet was asked to sign. That count
 * comes from a block that existed before the transaction did, so an earlier
 * transaction used the nonce. A lagging RPC only serves a lower count, which
 * refuses more often, never less. The count is read at `latest`: a `pending`
 * count includes transactions that may still be dropped. Without that proof
 * (no count, a refusal that names no nonce or several, or a nonce not yet used
 * when the send started) the wallet may have broadcast the transaction, so
 * nothing is retried and SendOutcomeUnknownError is thrown instead of the
 * refusal: the caller must not report a failure.
 *
 * Counts that moved still rule the retry out: the app RPC's count must be the
 * same after the rejection, and the wallet's node must count exactly that many,
 * since anything more is a transaction from the account the app's read did not
 * see. A wallet still behind would fail the second prompt the same way. The
 * pre-flight simulation (`prepare`) then runs again so the call still passes
 * against current state.
 *
 * The transaction sent once more is a new one, and its own "nonce too low"
 * gets the same test, against the count read after the first refusal (before
 * the wallet signed it): without proof it too is SendOutcomeUnknownError. It
 * is never sent a third time.
 *
 * `send` submits through the client it is given, which lets the wallet take
 * one submission (walletSubmission.ts): viem would otherwise answer a -32000
 * refusal by sending the same call again as `wallet_sendTransaction`, inside
 * `send` and before this function sees the error. Each attempt gets a new one.
 *
 * "Already known", "already imported" and "replacement transaction
 * underpriced" are never retried: a transaction with that nonce is already
 * pending. Anything else that rules the retry out rethrows the original error,
 * and a second failure propagates.
 */
export async function sendWithStaleNonceRetry({
  walletClient,
  publicClient,
  account,
  send,
  prepare,
}: {
  walletClient: WalletClient;
  publicClient: PublicClient;
  account: Address;
  send: (submissionClient: WalletClient) => Promise<Hash>;
  prepare: () => Promise<void>;
}): Promise<Hash> {
  const submit = () => send(singleSubmissionWalletClient(walletClient));
  const readAppCount = () =>
    getTransactionCount(publicClient, { address: account, blockTag: "latest" });

  const countBeforeSend = await readAppCount().catch(() => null);
  try {
    return await submit();
  } catch (error) {
    if (classifyError(error) !== "stale-nonce") throw error;
    const chainId = walletClient.chain?.id;

    const rejected = readRejectedNonce(error);
    if (!provesNeverMined(rejected, countBeforeSend)) {
      logger.warn("Not retrying a stale-nonce rejection", {
        data: { chainId, countBeforeSend, rejected },
      });
      throw new SendOutcomeUnknownError(error);
    }

    const countAfterRejection = await readAppCount().catch(() => null);
    if (
      countAfterRejection === null ||
      countAfterRejection !== countBeforeSend
    ) {
      logger.warn("Not retrying a stale-nonce rejection", {
        data: { chainId, countBeforeSend, countAfterRejection },
      });
      throw error;
    }

    const sync = await waitForWalletNonce({
      walletClient,
      account,
      minimumCount: countAfterRejection,
    });
    if (sync.status !== "synced" || sync.walletCount !== countAfterRejection) {
      logger.warn("Not retrying a stale-nonce rejection", {
        data: { chainId, minimumCount: countAfterRejection, ...sync },
      });
      throw error;
    }

    logger.warn("The wallet signed with a stale nonce; sending once more", {
      data: { chainId, rejected, minimumCount: countAfterRejection, ...sync },
    });
    await prepare();
    try {
      return await submit();
    } catch (retryError) {
      if (classifyError(retryError) !== "stale-nonce") throw retryError;
      const retryRejected = readRejectedNonce(retryError);
      if (provesNeverMined(retryRejected, countAfterRejection))
        throw retryError;
      logger.warn("The transaction sent once more may have been broadcast", {
        data: { chainId, countAfterRejection, rejected: retryRejected },
      });
      throw new SendOutcomeUnknownError(retryError);
    }
  }
}
