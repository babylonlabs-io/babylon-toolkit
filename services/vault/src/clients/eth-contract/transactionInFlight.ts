/**
 * Refuses a new transaction while one from the same account is still waiting
 * to be mined.
 *
 * The app's in-memory lock (`applications/aave/services/pendingAaveWrite.ts`)
 * only knows about transactions this page sent. A reload, another tab, or a
 * wallet that broadcast but never returned the hash leaves it empty while the
 * first transaction can still be mined. The node knows better: it counts an
 * account's transactions at `latest` (mined) and at `pending` (mined plus
 * those it holds in its mempool), so a higher `pending` count means one is
 * still in flight. A new transaction would queue behind it by nonce anyway,
 * so refusing costs nothing, and it keeps a slow borrow from being signed
 * twice.
 *
 * Both counts come from the app's RPC, never the wallet: MetaMask answers
 * `latest` from its own block tracker, up to 20 s behind, while `pending`
 * skips that pin, so the wallet would report every just-mined transaction as
 * still in flight (see `walletNonce.ts`).
 *
 * Best effort. A transaction sent through a private relay never reaches a
 * public mempool and is invisible here, and so is a Safe proposal, which uses
 * the Safe's own nonce. A failed read lets the write go ahead: the check must
 * not turn an RPC that cannot answer `pending` into a block on every Aave
 * write. The failure is reported as an error so its rate can be watched.
 */

import type { Address, PublicClient } from "viem";
import { getTransactionCount } from "viem/actions";

import { logger } from "@/infrastructure";
import { abortableSleep } from "@/utils/async";
import { TransactionInFlightError } from "@/utils/errors";

import { WALLET_NONCE_POLL_INTERVAL_MS } from "./walletNonce";

/**
 * True when the app's RPC counts more of `account`'s transactions at `pending`
 * than at `latest`. Null when a read failed, which is reported as an error.
 */
async function hasPendingTransaction(
  publicClient: PublicClient,
  account: Address,
): Promise<{ pending: boolean; latest: number; pendingCount: number } | null> {
  try {
    const [latest, pendingCount] = await Promise.all([
      getTransactionCount(publicClient, {
        address: account,
        blockTag: "latest",
      }),
      getTransactionCount(publicClient, {
        address: account,
        blockTag: "pending",
      }),
    ]);
    return { pending: pendingCount > latest, latest, pendingCount };
  } catch (error) {
    logger.error(error, {
      data: {
        context:
          "Could not check for a pending transaction before an Aave write; sending anyway",
      },
    });
    return null;
  }
}

/**
 * @throws TransactionInFlightError when the app's RPC holds a transaction from
 *   `account` that has not been mined yet.
 */
export async function assertNoTransactionInFlight({
  publicClient,
  account,
}: {
  publicClient: PublicClient;
  account: Address;
}): Promise<void> {
  const first = await hasPendingTransaction(publicClient, account);
  if (!first?.pending) return;

  // The two counts are separate reads, and a backend a block behind still
  // holds a just-mined transaction in its pool, so the action right after a
  // write can see it as pending. Read again a moment later before refusing.
  await abortableSleep(WALLET_NONCE_POLL_INTERVAL_MS);
  const again = await hasPendingTransaction(publicClient, account);
  if (!again?.pending) return;

  logger.warn("Refused an Aave write while a transaction is pending", {
    data: {
      chainId: publicClient.chain?.id,
      latest: again.latest,
      pending: again.pendingCount,
    },
  });
  throw new TransactionInFlightError();
}
