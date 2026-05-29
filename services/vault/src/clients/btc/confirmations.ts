/**
 * Mempool-API confirmation helper, shared by the dashboard batch poller
 * (`useBtcMempoolConfirmations`) and the in-flow single-tx poller
 * (`useBtcConfirmations`). Centralizing keeps the two in sync if the
 * mempool call shape ever changes — both callers compute the same number
 * for the same `(txid, tipHeight)`.
 */

import { stripHexPrefix } from "@babylonlabs-io/ts-sdk/tbv/core";
import { getTxInfo } from "@babylonlabs-io/ts-sdk/tbv/core/clients";

import { computeConfirmations } from "@/components/simple/DepositProgressView/btcConfirmationProgress";

/**
 * Fetches the tx from `apiUrl` and returns its confirmation count relative
 * to `tipHeight`. Mempool (unconfirmed) returns 0. The block that includes
 * the tx is the 1st confirmation.
 *
 * Callers handle errors (404 before broadcast, 429 rate-limits, network
 * blips) at their layer — this helper deliberately does not swallow them
 * so each caller can choose the right fallback for its UX.
 */
export async function fetchConfirmations(
  txid: string,
  apiUrl: string,
  tipHeight: number,
): Promise<number> {
  const info = await getTxInfo(stripHexPrefix(txid), apiUrl);
  return computeConfirmations(info.status, tipHeight);
}
