/**
 * Poll `getPeginStatus` until the VP reaches one of the target statuses.
 *
 * Pure polling utility with no framework dependencies (no localStorage, no React).
 * Handles "PegIn not found" as transient (VP hasn't ingested yet).
 */

import { JsonRpcError } from "../../clients/vault-provider/json-rpc-client";
import {
  DaemonStatus,
  RpcErrorCode,
  VP_TERMINAL_FAILURE_STATUSES,
} from "../../clients/vault-provider/types";
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
 * @returns The DaemonStatus that matched one of the targets, OR
 *   `DaemonStatus.ACTIVATED` if the VP raced past the requested target into the
 *   happy-path terminal (success-via-overshoot — the goal is satisfied).
 * @throws Error on timeout, abort, non-transient RPC error, or any terminal status (`Expired` + `VP_TERMINAL_FAILURE_STATUSES`) not in `targetStatuses`.
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

      // Reject responses echoing a different pegin txid.
      if (response.pegin_txid.toLowerCase() !== peginTxid.toLowerCase()) {
        throw new Error(
          `getPeginStatus returned status for pegin ${response.pegin_txid.slice(0, 8)}…, requested ${peginTxid.slice(0, 8)}…`,
        );
      }

      const status = response.status as DaemonStatus;
      if (targetStatuses.has(status)) {
        return status;
      }
      // Happy-path overshoot: VP raced past the requested target to ACTIVATED.
      // The caller's goal (reach some earlier state) is satisfied — return
      // success rather than time out waiting for a state the VP already left.
      if (status === DaemonStatus.ACTIVATED) {
        return status;
      }
      // EXPIRED is included — depositor has no path forward once VP marks the pegin Expired.
      if (
        status === DaemonStatus.EXPIRED ||
        VP_TERMINAL_FAILURE_STATUSES.has(status)
      ) {
        throw new Error(
          `Pegin ${peginTxid.slice(0, 8)}… reached terminal status "${status}" while waiting for ${[...targetStatuses].join(", ")}`,
        );
      }
    } catch (error) {
      // "PegIn not found" is transient — VP hasn't ingested the pegin yet.
      const isNotFound =
        error instanceof JsonRpcError &&
        error.code === RpcErrorCode.PEGIN_NOT_FOUND;
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
