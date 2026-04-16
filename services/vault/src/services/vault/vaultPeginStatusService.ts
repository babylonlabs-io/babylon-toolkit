/**
 * Vault PegIn Status Service
 *
 * Provides status polling utilities for the deposit flow.
 * All status-based waiting should go through `waitForPeginStatus` to
 * avoid duplicating the pollUntil + getPeginStatus pattern.
 */

import {
  JsonRpcError,
  RpcErrorCode,
  VP_TERMINAL_STATUSES,
  VaultProviderRpcClient,
} from "@babylonlabs-io/ts-sdk/tbv/core/clients";

import { pollUntil } from "@/utils/async";
import { stripHexPrefix } from "@/utils/btc";
import { getVpProxyUrl } from "@/utils/rpc";

/** Default polling interval (10 seconds) */
const DEFAULT_POLL_INTERVAL_MS = 10 * 1000;

export interface WaitForPeginStatusParams {
  /** Vault provider Ethereum address */
  providerAddress: string;
  /** Raw BTC pegin transaction hash (with or without 0x prefix) */
  peginTxHash: string;
  /** Set of acceptable statuses — polling stops when the VP reports one of these */
  targetStatuses: ReadonlySet<string>;
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
    providerAddress,
    peginTxHash,
    targetStatuses,
    timeoutMs,
    intervalMs = DEFAULT_POLL_INTERVAL_MS,
    signal,
  } = params;

  const rpcClient = new VaultProviderRpcClient(getVpProxyUrl(providerAddress));
  const strippedTxid = stripHexPrefix(peginTxHash);

  return pollUntil<string>(
    async () => {
      const response = await rpcClient.getPeginStatus(
        { pegin_txid: strippedTxid },
        signal,
      );
      const status = response.status;
      if (targetStatuses.has(status)) {
        return status;
      }
      // Fail fast on terminal statuses to avoid waiting for timeout
      if (
        VP_TERMINAL_STATUSES.has(status as never) &&
        !targetStatuses.has(status)
      ) {
        throw new Error(
          `Pegin ${strippedTxid.slice(0, 8)}… reached terminal status "${status}" while waiting for ${[...targetStatuses].join(", ")}`,
        );
      }
      return null;
    },
    {
      intervalMs,
      timeoutMs,
      isTransient: (error) =>
        (error instanceof JsonRpcError &&
          error.code === RpcErrorCode.NOT_FOUND) ||
        (error instanceof Error && error.message.includes("PegIn not found")),
      signal,
    },
  );
}
