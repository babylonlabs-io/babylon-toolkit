/**
 * Step 2.5: WOTS public key RPC submission — adapter over SDK.
 */

import { stripHexPrefix } from "@babylonlabs-io/ts-sdk/tbv/core";
import type { GetPeginStatusResponse } from "@babylonlabs-io/ts-sdk/tbv/core/clients";
import {
  batchPollByProvider,
  DaemonStatus,
  VP_TERMINAL_FAILURE_STATUSES,
  VP_TRANSIENT_STATUSES,
  VpResponseValidationError,
} from "@babylonlabs-io/ts-sdk/tbv/core/clients";
import { submitWotsPublicKey as sdkSubmitWotsPublicKey } from "@babylonlabs-io/ts-sdk/tbv/core/services";
import type { Hex } from "viem";

import { POLLING_INTERVAL_MS } from "@/config/polling";
import { logger } from "@/infrastructure";
import { createVpClient } from "@/utils/rpc";

import { ensureAuthenticatedVpClient } from "./ensureAuthenticatedVpClient";
import type { WotsSubmissionParams } from "./types";

const DEFAULT_WOTS_READY_TIMEOUT_MS = 20 * 60 * 1000;

type WotsReadinessStatus = "ready" | "waiting" | "terminal";

interface WotsReadinessVault {
  vaultId: Hex;
  peginTxHash: Hex;
}

export interface WaitForWotsReadinessParams {
  vaults: WotsReadinessVault[];
  providerAddress: string;
  signal?: AbortSignal;
  timeoutMs?: number;
  pollIntervalMs?: number;
}

export interface WotsReadinessResult {
  readyVaultIds: Set<Hex>;
  terminalVaultIds: Set<Hex>;
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(resolve, ms);
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

function classifyWotsReadinessStatus(
  status: DaemonStatus,
): WotsReadinessStatus {
  if (status === DaemonStatus.PENDING_DEPOSITOR_WOTS_PK) return "ready";
  if (
    status === DaemonStatus.PENDING_DEPOSITOR_SIGNATURES ||
    VP_TRANSIENT_STATUSES.has(status)
  ) {
    return "ready";
  }
  if (
    status === DaemonStatus.PENDING_INGESTION ||
    status === DaemonStatus.EXPIRED ||
    VP_TERMINAL_FAILURE_STATUSES.has(status)
  ) {
    return status === DaemonStatus.PENDING_INGESTION ? "waiting" : "terminal";
  }
  return "waiting";
}

/**
 * Wait once for a batch's VP daemon state to reach the WOTS submission point.
 *
 * The live split-pegin flow broadcasts one shared Pre-PegIn and used to enter
 * the serial WOTS loop immediately. That spent the first vault's SDK polling
 * budget while the VP was still ingesting the shared tx. This gate waits at
 * the batch level first, so per-vault WOTS retries are reserved for actual
 * submission attempts.
 */
export async function waitForWotsReadiness({
  vaults,
  providerAddress,
  signal,
  timeoutMs = DEFAULT_WOTS_READY_TIMEOUT_MS,
  pollIntervalMs = POLLING_INTERVAL_MS,
}: WaitForWotsReadinessParams): Promise<WotsReadinessResult> {
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

    await batchPollByProvider<WotsReadinessVault, GetPeginStatusResponse>({
      items: pendingVaults,
      getTxid: (vault) => stripHexPrefix(vault.peginTxHash),
      batchCall: (pegin_txids) =>
        rpcClient.batchGetPeginStatus({ pegin_txids }),
      onItem: (vault, envelope) => {
        if (envelope.error !== null) {
          if (!envelope.error.includes("PegIn not found")) {
            logger.warn("WOTS readiness poll returned an item error", {
              vaultId: vault.vaultId,
              error: envelope.error,
            });
          }
          return;
        }

        const status = envelope.result!.status as DaemonStatus;
        const readiness = classifyWotsReadinessStatus(status);
        if (readiness === "ready") readyVaultIds.add(vault.vaultId);
        if (readiness === "terminal") terminalVaultIds.add(vault.vaultId);
      },
      onMissing: (vault) =>
        logger.warn("WOTS readiness poll missing vault status", {
          vaultId: vault.vaultId,
        }),
      onDuplicate: (vault) =>
        logger.warn("WOTS readiness poll returned duplicate vault status", {
          vaultId: vault.vaultId,
        }),
      onDuplicateBatch: (count) =>
        logger.warn("WOTS readiness poll returned duplicate txids", { count }),
      onWholeBatchError: (_chunk, error) => {
        const detail =
          error instanceof VpResponseValidationError
            ? error.detail
            : error instanceof Error
              ? error.message
              : String(error);
        logger.warn("WOTS readiness poll failed for batch", { error: detail });
      },
      onUnexpected: (echoed) =>
        logger.warn("WOTS readiness poll returned unexpected txids", {
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

/**
 * Submit pre-derived WOTS block public keys to the vault provider via RPC.
 *
 * Polls `getPeginStatus` first to ensure the VP has ingested the pegin and
 * is ready to accept the WOTS key (status = `PendingDepositorWotsPK`).
 * If the VP has already moved past that status, submission is skipped.
 */
export async function submitWotsPublicKey(
  params: WotsSubmissionParams,
): Promise<void> {
  const {
    vaultId,
    peginTxHash,
    depositorBtcPubkey,
    providerAddress,
    wotsPublicKeys,
    btcWallet,
    unsignedPrePeginTxHex,
    signal,
  } = params;

  const peginTxid = stripHexPrefix(peginTxHash);
  const rpcClient = await ensureAuthenticatedVpClient({
    btcWallet,
    vaultId,
    unsignedPrePeginTxHex,
    peginTxHash,
    providerAddress,
    depositorBtcPubkey,
  });

  await sdkSubmitWotsPublicKey({
    statusReader: rpcClient,
    wotsSubmitter: rpcClient,
    peginTxid,
    depositorPk: stripHexPrefix(depositorBtcPubkey),
    wotsPublicKeys,
    signal,
  });
}
