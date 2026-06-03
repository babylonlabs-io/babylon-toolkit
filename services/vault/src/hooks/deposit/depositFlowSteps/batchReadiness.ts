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
import { abortableSleep } from "@/utils/async";
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

const MIN_POLL_INTERVAL_MS = 1;

function getMaxPollAttempts(timeoutMs: number, pollIntervalMs: number): number {
  if (timeoutMs <= 0) return 1;
  return Math.ceil(timeoutMs / pollIntervalMs) + 1;
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
  const effectivePollIntervalMs = Math.max(
    MIN_POLL_INTERVAL_MS,
    pollIntervalMs,
  );
  const maxPollAttempts = getMaxPollAttempts(
    timeoutMs,
    effectivePollIntervalMs,
  );
  const rpcClient = createVpClient(providerAddress);

  // Bound the poller by timeout-derived attempts: one immediate poll, then at
  // most one poll per interval until the deadline. This keeps the helper from
  // spinning forever if a VP keeps returning only waiting/missing statuses.
  for (let attempt = 0; attempt < maxPollAttempts; attempt += 1) {
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
    await abortableSleep(
      Math.min(effectivePollIntervalMs, remainingMs),
      signal,
    );
  }

  return { readyVaultIds, terminalVaultIds };
}
