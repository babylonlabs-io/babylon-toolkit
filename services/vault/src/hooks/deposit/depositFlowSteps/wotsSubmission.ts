/**
 * Step 2.5: WOTS public key RPC submission — adapter over SDK.
 */

import { stripHexPrefix } from "@babylonlabs-io/ts-sdk/tbv/core";
import {
  DaemonStatus,
  VP_TERMINAL_FAILURE_STATUSES,
  VP_TRANSIENT_STATUSES,
} from "@babylonlabs-io/ts-sdk/tbv/core/clients";
import { submitWotsPublicKey as sdkSubmitWotsPublicKey } from "@babylonlabs-io/ts-sdk/tbv/core/services";
import type { Hex } from "viem";

import { POLLING_INTERVAL_MS } from "@/config/polling";

import {
  type BatchReadinessStatus,
  type BatchReadinessVault,
  waitForBatchReadiness,
} from "./batchReadiness";
import { ensureAuthenticatedVpClient } from "./ensureAuthenticatedVpClient";
import type { WotsSubmissionParams } from "./types";

const DEFAULT_WOTS_READY_TIMEOUT_MS = 20 * 60 * 1000;

export interface WaitForWotsReadinessParams {
  vaults: BatchReadinessVault[];
  providerAddress: string;
  signal?: AbortSignal;
  timeoutMs?: number;
  pollIntervalMs?: number;
}

export interface WotsReadinessResult {
  readyVaultIds: Set<Hex>;
  terminalVaultIds: Set<Hex>;
}

function classifyWotsReadinessStatus(
  status: DaemonStatus,
): BatchReadinessStatus {
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
  return waitForBatchReadiness({
    vaults,
    providerAddress,
    classifyStatus: classifyWotsReadinessStatus,
    logLabel: "WOTS readiness",
    signal,
    timeoutMs,
    pollIntervalMs,
  });
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
