import { stripHexPrefix } from "@babylonlabs-io/ts-sdk/tbv/core";
import {
  batchPollByProvider,
  type DaemonStatus,
  type GetPeginStatusResponse,
  VpResponseValidationError,
} from "@babylonlabs-io/ts-sdk/tbv/core/clients";
import type { Hex } from "viem";

import { POLLING_INTERVAL_MS } from "@/config/polling";
import { logger } from "@/infrastructure";
import { createVpClient } from "@/utils/rpc";

export type BatchReadinessStatus = "ready" | "waiting" | "terminal";

export interface BatchReadinessVault {
  vaultId: Hex;
  peginTxHash: Hex;
}

export interface BatchReadinessResult {
  readyVaultIds: Set<Hex>;
  terminalVaultIds: Set<Hex>;
}

export interface WaitForBatchReadinessParams {
  vaults: BatchReadinessVault[];
  providerAddress: string;
  classifyStatus: (status: DaemonStatus) => BatchReadinessStatus;
  logLabel: string;
  signal?: AbortSignal;
  timeoutMs: number;
  pollIntervalMs?: number;
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timeout);
      reject(signal?.reason ?? new DOMException("Aborted", "AbortError"));
    };
    if (signal) {
      if (signal.aborted) {
        onAbort();
        return;
      }
      signal.addEventListener("abort", onAbort, { once: true });
    }
  });
}

export async function waitForBatchReadiness({
  vaults,
  providerAddress,
  classifyStatus,
  logLabel,
  signal,
  timeoutMs,
  pollIntervalMs = POLLING_INTERVAL_MS,
}: WaitForBatchReadinessParams): Promise<BatchReadinessResult> {
  if (vaults.length === 0) {
    return { readyVaultIds: new Set(), terminalVaultIds: new Set() };
  }

  const readyVaultIds = new Set<Hex>();
  const terminalVaultIds = new Set<Hex>();
  const deadline = Date.now() + timeoutMs;
  const rpcClient = createVpClient(providerAddress);

  while (readyVaultIds.size + terminalVaultIds.size < vaults.length) {
    signal?.throwIfAborted();

    const pendingVaults = vaults.filter(
      (v) => !readyVaultIds.has(v.vaultId) && !terminalVaultIds.has(v.vaultId),
    );

    await batchPollByProvider<BatchReadinessVault, GetPeginStatusResponse>({
      items: pendingVaults,
      getTxid: (vault) => stripHexPrefix(vault.peginTxHash),
      batchCall: (pegin_txids) =>
        rpcClient.batchGetPeginStatus({ pegin_txids }),
      onItem: (vault, envelope) => {
        if (envelope.error !== null) {
          if (!envelope.error.includes("PegIn not found")) {
            logger.warn(`${logLabel} poll returned an item error`, {
              vaultId: vault.vaultId,
              error: envelope.error,
            });
          }
          return;
        }

        const status = envelope.result!.status as DaemonStatus;
        const readiness = classifyStatus(status);
        if (readiness === "ready") readyVaultIds.add(vault.vaultId);
        if (readiness === "terminal") terminalVaultIds.add(vault.vaultId);
      },
      onMissing: (vault) =>
        logger.warn(`${logLabel} poll missing vault status`, {
          vaultId: vault.vaultId,
        }),
      onDuplicate: (vault) =>
        logger.warn(`${logLabel} poll returned duplicate vault status`, {
          vaultId: vault.vaultId,
        }),
      onDuplicateBatch: (count) =>
        logger.warn(`${logLabel} poll returned duplicate txids`, { count }),
      onWholeBatchError: (_chunk, error) => {
        const detail =
          error instanceof VpResponseValidationError
            ? error.detail
            : error instanceof Error
              ? error.message
              : String(error);
        logger.warn(`${logLabel} poll failed for batch`, { error: detail });
      },
      onUnexpected: (echoed) =>
        logger.warn(`${logLabel} poll returned unexpected txids`, {
          count: echoed.length,
        }),
    });

    if (readyVaultIds.size + terminalVaultIds.size >= vaults.length) break;

    const remainingMs = deadline - Date.now();
    if (remainingMs <= 0) break;
    await sleep(Math.min(pollIntervalMs, remainingMs), signal);
  }

  return { readyVaultIds, terminalVaultIds };
}
