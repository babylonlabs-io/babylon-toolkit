/**
 * Poll `getPeginStatus` until the VP reaches one of the target statuses.
 *
 * Pure polling utility with no framework dependencies (no localStorage, no React).
 * Handles "PegIn not found" as transient (VP hasn't ingested yet).
 */

import { JsonRpcError } from "../../clients/vault-provider/json-rpc-client";
import { RpcErrorCode, type DaemonStatus } from "../../clients/vault-provider/types";
import type { PeginStatusReader } from "./interfaces";

/** Default polling interval (10 seconds). */
const DEFAULT_POLL_INTERVAL_MS = 10_000;

export interface WaitForPeginStatusParams {
  /** VP client implementing the status reader interface */
  statusReader: PeginStatusReader;
  /** BTC pegin transaction ID (unprefixed hex, 64 chars) */
  peginTxid: string;
  /** Set of acceptable statuses — polling stops when the VP reports one of these */
  targetStatuses: ReadonlySet<DaemonStatus>;
  /** Maximum time to wait in milliseconds */
  timeoutMs: number;
  /** Polling interval in milliseconds (default: 10s) */
  pollIntervalMs?: number;
  /** AbortSignal for cancellation */
  signal?: AbortSignal;
}

/**
 * Poll `getPeginStatus` until the VP reaches one of the target statuses.
 *
 * @returns The DaemonStatus string that matched one of the targets
 * @throws Error on timeout, abort, or non-transient RPC error
 */
export async function waitForPeginStatus(
  params: WaitForPeginStatusParams,
): Promise<DaemonStatus> {
  const {
    statusReader,
    peginTxid,
    targetStatuses,
    timeoutMs,
    pollIntervalMs = DEFAULT_POLL_INTERVAL_MS,
    signal,
  } = params;

  const startTime = Date.now();

  while (true) {
    if (signal?.aborted) {
      throw new Error(
        `Polling aborted for pegin ${peginTxid.slice(0, 8)}… (target: ${[...targetStatuses].join(", ")})`,
      );
    }

    if (Date.now() - startTime >= timeoutMs) {
      throw new Error(
        `Polling timeout after ${timeoutMs}ms for pegin ${peginTxid.slice(0, 8)}… (target: ${[...targetStatuses].join(", ")})`,
      );
    }

    try {
      const response = await statusReader.getPeginStatus(
        { pegin_txid: peginTxid },
        signal,
      );

      const status = response.status as DaemonStatus;
      if (targetStatuses.has(status)) {
        return status;
      }
    } catch (error) {
      // "PegIn not found" is transient — VP hasn't ingested the pegin yet.
      // Check structured error code first, fall back to message matching.
      const isNotFound =
        (error instanceof JsonRpcError &&
          error.code === RpcErrorCode.NOT_FOUND) ||
        (error instanceof Error && error.message.includes("PegIn not found"));
      if (!isNotFound) {
        throw error;
      }
    }

    // Wait before next poll, with abort support
    await new Promise<void>((resolve, reject) => {
      const onAbort = () => {
        clearTimeout(timeoutId);
        reject(
          new Error(
            `Polling aborted for pegin ${peginTxid.slice(0, 8)}… (target: ${[...targetStatuses].join(", ")})`,
          ),
        );
      };
      const timeoutId = setTimeout(() => {
        signal?.removeEventListener("abort", onAbort);
        resolve();
      }, pollIntervalMs);
      signal?.addEventListener("abort", onAbort, { once: true });
    });
  }
}
