/**
 * Polling services for deposit flow
 *
 * Stateless async functions for polling vault provider and indexer.
 * These functions handle the waiting/polling logic without React dependencies.
 */

import type { Hex } from "viem";

import { VaultProviderRpcApi } from "@/clients/vault-provider-rpc";
import type { ClaimerTransactions } from "@/clients/vault-provider-rpc/types";
import { fetchVaultById } from "@/services/vault";
import { pollUntil } from "@/utils/async";
import { stripHexPrefix } from "@/utils/btc";

/** Timeout for RPC requests (30 seconds) */
const RPC_TIMEOUT_MS = 30 * 1000;

/**
 * Polling interval for payout transactions.
 *
 * 10 seconds balances responsiveness with backend load.
 */
const POLLING_INTERVAL_MS = 10 * 1000;

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
 * Invalid state patterns that indicate the vault provider is still processing.
 */
const INVALID_STATE_PATTERNS = [
  "Acknowledged",
  "PendingChallengerSignatures",
] as const;

/**
 * Check if an error is transient and polling should continue.
 */
function isTransientError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const msg = error.message;

  if (TRANSIENT_ERROR_PATTERNS.some((pattern) => msg.includes(pattern))) {
    return true;
  }

  if (
    msg.includes("Invalid state") &&
    INVALID_STATE_PATTERNS.some((pattern) => msg.includes(pattern))
  ) {
    return true;
  }

  return false;
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
      intervalMs: POLLING_INTERVAL_MS,
      timeoutMs: MAX_POLLING_TIMEOUT_MS,
      isTransient: isTransientError,
      signal,
    },
  );
}

export interface WaitForContractVerificationParams {
  /** BTC transaction ID (with 0x prefix) */
  btcTxid: string;
  /** Optional AbortSignal for cancellation */
  signal?: AbortSignal;
}

/**
 * Wait for contract status to reach verified state.
 *
 * Polls the indexer until the vault status indicates it's ready
 * for BTC broadcast (status >= 1).
 *
 * @throws Error on timeout or abort
 */
export async function waitForContractVerification(
  params: WaitForContractVerificationParams,
): Promise<void> {
  const { btcTxid, signal } = params;

  await pollUntil<true>(
    async () => {
      try {
        const vault = await fetchVaultById(btcTxid as Hex);
        // Status values:
        //   0 = PENDING (waiting for signatures)
        //   1 = VERIFIED (ready for broadcast)
        //   2+ = Post-broadcast states
        if (vault && vault.status >= 1) {
          return true;
        }
        return null;
      } catch (error) {
        // Continue polling - vault may not be indexed yet
        console.warn("Error polling for contract verification:", error);
        return null;
      }
    },
    {
      intervalMs: POLLING_INTERVAL_MS,
      timeoutMs: MAX_POLLING_TIMEOUT_MS,
      signal,
    },
  );
}
