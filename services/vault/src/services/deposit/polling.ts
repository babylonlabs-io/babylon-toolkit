/**
 * Polling services for deposit flow
 *
 * Stateless async functions for polling vault provider and indexer.
 * These functions handle the waiting/polling logic without React dependencies.
 */

import type { Hex } from "viem";

import { VaultProviderRpcApi } from "@/clients/vault-provider-rpc";
import type { ClaimerTransactions } from "@/clients/vault-provider-rpc/types";
import {
  type DaemonProgress,
  type DaemonStatus,
  DaemonStatus as DaemonStatusEnum,
  isPreDepositorSignaturesError,
} from "@/models/peginStateMachine";
import { fetchVaultById } from "@/services/vault";
import { checkPeginStatus } from "@/services/vault/vaultPeginStatusService";
import { pollUntil } from "@/utils/async";
import { stripHexPrefix } from "@/utils/btc";

/** Callback for reporting daemon progress during polling */
export type DaemonProgressCallback = (
  status: DaemonStatus,
  progress?: DaemonProgress,
) => void;

/** Timeout for RPC requests (30 seconds) */
const RPC_TIMEOUT_MS = 30 * 1000;

/**
 * Polling interval for payout transaction preparation (Step 3).
 * 10 seconds is reasonable since vault provider needs time to generate transactions.
 */
const PAYOUT_POLLING_INTERVAL_MS = 10 * 1000;

/**
 * Polling interval for ACK collection (Step 4).
 * 1 second to catch intermediate states since challengers can be fast.
 */
const ACK_POLLING_INTERVAL_MS = 1 * 1000;

/**
 * Maximum time to wait for polling operations (2 minutes per step).
 *
 * Safety cap to avoid leaving users waiting too long.
 * If exceeded, user can continue from the deposits table.
 */
const MAX_POLLING_TIMEOUT_MS = 2 * 60 * 1000;

/**
 * Transient error patterns that indicate polling should continue.
 */
const TRANSIENT_ERROR_PATTERNS = [
  "PegIn not found",
  "No transaction graphs found",
] as const;

/**
 * Check if an error is transient and polling should continue.
 */
function isTransientError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;

  // Check for pre-depositor-signatures states (vault provider still processing)
  if (isPreDepositorSignaturesError(error)) {
    return true;
  }

  // Check for other transient patterns
  return TRANSIENT_ERROR_PATTERNS.some((pattern) =>
    error.message.includes(pattern),
  );
}

export interface PollForPayoutTransactionsParams {
  /** BTC transaction ID (with 0x prefix) */
  btcTxid: string;
  /** Depositor's BTC public key (32-byte x-only, no 0x prefix) */
  depositorBtcPubkey: string;
  /** Vault provider RPC URL */
  providerUrl: string;
  /** Optional AbortSignal for cancellation */
  signal?: AbortSignal;
}

/**
 * Poll vault provider for depositor presign transactions.
 *
 * Waits until the vault provider has prepared the transactions
 * for depositor to sign (PayoutOptimistic and Payout).
 *
 * @returns Array of claimer transactions ready for signing
 * @throws Error on timeout, abort, or non-transient RPC error
 */
export async function pollForPayoutTransactions(
  params: PollForPayoutTransactionsParams,
): Promise<ClaimerTransactions[]> {
  const { btcTxid, depositorBtcPubkey, providerUrl, signal } = params;

  const rpcClient = new VaultProviderRpcApi(providerUrl, RPC_TIMEOUT_MS);

  return pollUntil<ClaimerTransactions[]>(
    async () => {
      const response = await rpcClient.requestDepositorPresignTransactions({
        pegin_txid: stripHexPrefix(btcTxid),
        depositor_pk: depositorBtcPubkey,
      });

      if (response.txs && response.txs.length > 0) {
        return response.txs;
      }
      return null;
    },
    {
      intervalMs: PAYOUT_POLLING_INTERVAL_MS,
      timeoutMs: MAX_POLLING_TIMEOUT_MS,
      isTransient: isTransientError,
      signal,
    },
  );
}

export interface WaitForContractVerificationParams {
  /** BTC transaction ID (with 0x prefix) */
  btcTxid: string;
  /** Vault provider RPC URL (for fetching daemon status) */
  providerUrl?: string;
  /** Optional AbortSignal for cancellation */
  signal?: AbortSignal;
}

/**
 * Extract progress from daemon status result
 */
function extractProgress(
  statusResult: Awaited<ReturnType<typeof checkPeginStatus>>,
): DaemonProgress | undefined {
  const { status, progress } = statusResult;

  if (status === DaemonStatusEnum.PENDING_GC_DATA && progress.gc_data) {
    return {
      completed: progress.gc_data.completed_challengers,
      total: progress.gc_data.total_challengers,
    };
  }
  if (
    status === DaemonStatusEnum.PENDING_CHALLENGER_PRESIGNING &&
    progress.presigning
  ) {
    return {
      completed: progress.presigning.completed_challengers,
      total: progress.presigning.total_challengers,
    };
  }
  if (status === DaemonStatusEnum.PENDING_ACKS && progress.ack_collection) {
    return {
      completed: progress.ack_collection.completed_challengers,
      total: progress.ack_collection.total_challengers,
    };
  }
  return undefined;
}

/**
 * Extract total challengers from any available progress field.
 * The total is the same across all stages (gc_data, presigning, ack_collection).
 */
function extractTotalChallengers(
  statusResult: Awaited<ReturnType<typeof checkPeginStatus>>,
): number {
  const { progress } = statusResult;
  return (
    progress.ack_collection?.total_challengers ||
    progress.presigning?.total_challengers ||
    progress.gc_data?.total_challengers ||
    0
  );
}

/** Brief delay to show completion state before transitioning (ms) */
const COMPLETION_DISPLAY_MS = 1000;

/**
 * Check if daemon status indicates ACK collection is complete
 */
function isAckCollectionComplete(status: DaemonStatus): boolean {
  return (
    status === DaemonStatusEnum.PENDING_ACTIVATION ||
    status === DaemonStatusEnum.ACTIVATED ||
    status === DaemonStatusEnum.CLAIM_POSTED ||
    status === DaemonStatusEnum.PEGGED_OUT
  );
}

/**
 * Wait for contract status to reach verified state.
 *
 * Polls the indexer until the vault status indicates it's ready
 * for BTC broadcast (status >= 1).
 *
 * @param params - Polling parameters
 * @param onDaemonProgress - Optional callback to report daemon status during polling
 * @throws Error on timeout or abort
 */
export async function waitForContractVerification(
  params: WaitForContractVerificationParams,
  onDaemonProgress?: DaemonProgressCallback,
): Promise<void> {
  const { btcTxid, providerUrl, signal } = params;

  // Track last known total for showing "complete" state
  let lastKnownTotal = 0;

  await pollUntil<true>(
    async () => {
      // Check daemon status first - this is authoritative for ACK collection
      if (providerUrl) {
        try {
          const statusResult = await checkPeginStatus(btcTxid, {
            address: "0x0" as `0x${string}`,
            url: providerUrl,
          });
          const daemonProgress = extractProgress(statusResult);

          // Track the total for showing completion state (from any progress field)
          const totalFromResult = extractTotalChallengers(statusResult);
          if (totalFromResult > 0) {
            lastKnownTotal = totalFromResult;
          } else if (daemonProgress?.total) {
            lastKnownTotal = daemonProgress.total;
          }

          // Check if ACKs are complete:
          // 1. Daemon moved past ACK collection (PENDING_ACTIVATION or beyond), OR
          // 2. ack_collection shows all challengers done (completed == total)
          const ackProgress = statusResult.progress.ack_collection;
          const acksComplete =
            isAckCollectionComplete(statusResult.status) ||
            (ackProgress &&
              ackProgress.total_challengers > 0 &&
              ackProgress.completed_challengers >=
                ackProgress.total_challengers);

          if (acksComplete) {
            // Report "complete" progress (all challengers done)
            const total = ackProgress?.total_challengers || lastKnownTotal;
            if (total > 0) {
              onDaemonProgress?.(DaemonStatusEnum.PENDING_ACKS, {
                completed: total,
                total: total,
              });
            } else {
              onDaemonProgress?.(statusResult.status, daemonProgress);
            }
            // Brief delay so user sees completion state
            await new Promise((resolve) =>
              setTimeout(resolve, COMPLETION_DISPLAY_MS),
            );
            return true;
          }

          // Still collecting - report current progress
          onDaemonProgress?.(statusResult.status, daemonProgress);
        } catch {
          // Fall through to indexer check
        }
      }

      // Fallback: check indexer status (in case daemon is unavailable)
      try {
        const vault = await fetchVaultById(btcTxid as Hex);
        // Status values:
        //   0 = PENDING (waiting for signatures)
        //   1 = VERIFIED (ready for broadcast)
        //   2+ = Post-broadcast states
        if (vault && vault.status >= 1) {
          return true; // Done
        }
      } catch (error) {
        // Continue polling - vault may not be indexed yet
        console.warn("Error polling for contract verification:", error);
      }

      return null; // Continue polling
    },
    {
      intervalMs: ACK_POLLING_INTERVAL_MS,
      timeoutMs: MAX_POLLING_TIMEOUT_MS,
      signal,
    },
  );
}
