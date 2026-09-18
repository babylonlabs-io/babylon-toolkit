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
  type TransactionReceipt,
  type WalletClient,
  withTimeout,
} from "viem";
import { getTransactionCount, getTransactionReceipt } from "viem/actions";

import { logger } from "@/infrastructure";
import { abortableSleep } from "@/utils/async";
import { classifyError } from "@/utils/errors";

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
 * Read a just-mined transaction's nonce from the app's RPC, retrying until
 * `deadline`: a load-balanced backend can briefly miss a transaction another
 * backend just returned the receipt for. Null when no read found it in time.
 */
async function readMinedNonce(
  publicClient: PublicClient,
  hash: Hash,
  deadline: number,
): Promise<{ nonce: number } | { nonce: null; error: string }> {
  for (;;) {
    try {
      const { nonce } = await readBefore(deadline, () =>
        publicClient.getTransaction({ hash }),
      );
      return { nonce };
    } catch (error) {
      const remainingMs = deadline - Date.now();
      if (remainingMs <= 0) return { nonce: null, error: errorText(error) };
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
  const mined = await readMinedNonce(publicClient, hash, deadline);
  if (mined.nonce === null) {
    logger.warn("Could not read a mined transaction to wait for the wallet", {
      data: { hash, waitedMs: Date.now() - startedAt, error: mined.error },
    });
    return;
  }

  const sync = await waitForWalletNonce({
    walletClient,
    account,
    minimumCount: mined.nonce + 1,
    nudgeHash: hash,
    timeoutMs: deadline - Date.now(),
  });
  if (sync.status === "synced") return;

  logger.warn("The wallet had not counted a mined transaction", {
    data: {
      chainId: walletClient.chain?.id,
      hash,
      minedNonce: mined.nonce,
      ...sync,
    },
  });
}

/**
 * Send a transaction, and send it once more if the wallet signed it with a
 * nonce the chain had already used before this send started.
 *
 * "Nonce too low" only says the nonce is used. That is safe to retry when an
 * earlier transaction used it, since the rejected one can then never be mined;
 * it is not safe when this same transaction was broadcast and mined anyway. So
 * the app RPC's count for the account is read before the send, and the retry
 * happens only when it has not moved by the time of the rejection. The app's
 * RPC can lag, so the wallet's own count must then catch up to exactly that
 * count: a wallet already counting more means something from the account
 * mined that the app's read missed, possibly this transaction. A wallet still
 * behind would fail the second prompt the same way. The pre-flight simulation
 * (`prepare`) then runs again so the call still passes against current state.
 *
 * "Already known", "already imported" and "replacement transaction
 * underpriced" are never retried: a transaction with that nonce is already
 * pending. Anything that rules the retry out rethrows the original error, and
 * a second failure propagates.
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
  send: () => Promise<Hash>;
  prepare: () => Promise<void>;
}): Promise<Hash> {
  const readAppCount = () =>
    getTransactionCount(publicClient, { address: account, blockTag: "latest" });

  const countBeforeSend = await readAppCount().catch(() => null);
  try {
    return await send();
  } catch (error) {
    if (classifyError(error) !== "stale-nonce") throw error;
    const chainId = walletClient.chain?.id;

    const countAfterRejection = await readAppCount().catch(() => null);
    if (
      countBeforeSend === null ||
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
      data: { chainId, minimumCount: countAfterRejection, ...sync },
    });
    await prepare();
    return send();
  }
}
