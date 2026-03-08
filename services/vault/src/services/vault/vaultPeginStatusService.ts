/**
 * Vault PegIn Status Service
 *
 * Provides status polling utilities for the deposit flow.
 * All status-based waiting should go through `waitForPeginStatus` to
 * avoid duplicating the pollUntil + getPeginStatus pattern.
 */

import { VaultProviderRpcApi } from "@/clients/vault-provider-rpc";
import { pollUntil } from "@/utils/async";
import { stripHexPrefix } from "@/utils/btc";

/** Timeout for RPC requests (60 seconds) */
const RPC_TIMEOUT_MS = 60 * 1000;

/** Default polling interval (10 seconds) */
const DEFAULT_POLL_INTERVAL_MS = 10 * 1000;

export interface WaitForPeginStatusParams {
  /** Vault provider RPC URL */
  providerUrl: string;
  /** BTC transaction ID (with or without 0x prefix) */
  btcTxid: string;
  /** Set of acceptable statuses — polling stops when the VP reports one of these */
  targetStatuses: Set<string>;
  /** Maximum time to wait in milliseconds */
  timeoutMs: number;
  /** Polling interval in milliseconds (default: 10s) */
  intervalMs?: number;
  /** AbortSignal for cancellation */
  signal?: AbortSignal;
}

/**
 * Poll `getPeginStatus` until the VP reaches one of the target statuses.
 *
 * Handles "PegIn not found" as transient (VP hasn't ingested yet).
 *
 * @returns The status string that matched one of the targets
 */
export async function waitForPeginStatus(
  params: WaitForPeginStatusParams,
): Promise<string> {
  const {
    providerUrl,
    btcTxid,
    targetStatuses,
    timeoutMs,
    intervalMs = DEFAULT_POLL_INTERVAL_MS,
    signal,
  } = params;

  const rpcClient = new VaultProviderRpcApi(providerUrl, RPC_TIMEOUT_MS);
  const strippedTxid = stripHexPrefix(btcTxid);

  return pollUntil<string>(
    async () => {
      const response = await rpcClient.getPeginStatus({
        pegin_txid: strippedTxid,
      });
      return targetStatuses.has(response.status) ? response.status : null;
    },
    {
      intervalMs,
      timeoutMs,
      isTransient: (error) =>
        error instanceof Error && error.message.includes("PegIn not found"),
      signal,
    },
  );
}
