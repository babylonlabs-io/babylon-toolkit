/**
 * Utility functions for Peg-In Polling
 */

import type { Hex } from "viem";

import {
  ContractStatus,
  isPreDepositorSignaturesError,
  LocalStorageStatus,
} from "../models/peginStateMachine";
import type { PendingPeginRequest } from "../storage/peginStorage";
import type { ClaimerTransactions, VaultProvider } from "../types";
import type { VaultActivity } from "../types/activity";
import type { DepositsByProvider, DepositToPoll } from "../types/peginPolling";

import { isVaultOwnedByWallet } from "./vaultWarnings";

// ============================================================================
// Transient Error Detection
// ============================================================================

/**
 * Transient error patterns that indicate vault provider is still processing.
 * These are expected during the early stages of a deposit and should not
 * be shown to users as errors. Polling should continue when these occur.
 */
export const TRANSIENT_ERROR_PATTERNS = [
  "PegIn not found",
  "No transaction graphs found",
  "Vault or pegin transaction not found",
] as const;

// ============================================================================
// Terminal Error Detection
// ============================================================================

/**
 * Terminal error patterns that indicate a permanent failure.
 * These errors will never resolve on their own (e.g., wallet mismatch),
 * so polling should stop immediately to avoid wasting requests.
 */
export const TERMINAL_ERROR_PATTERNS = ["Unauthorized depositor"] as const;

/**
 * Check if an error is terminal (will never resolve, polling should stop).
 *
 * Terminal errors occur when there is a fundamental mismatch that cannot
 * be fixed by retrying, such as using different BTC and ETH wallets
 * for vaults.
 */
export function isTerminalPollingError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;

  return TERMINAL_ERROR_PATTERNS.some((pattern) =>
    error.message.includes(pattern),
  );
}

/**
 * Check if an error is transient (vault provider still processing).
 *
 * Transient errors occur when:
 * - Vault provider hasn't indexed the pegin yet
 * - Vault provider is in a pre-depositor-signatures state
 * - Transaction graphs haven't been generated yet
 *
 * When a transient error is detected, polling should continue.
 */
export function isTransientPollingError(error: unknown): boolean {
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

/**
 * Check if transactions response has all required data for signing
 */
export function areTransactionsReady(txs: ClaimerTransactions[]): boolean {
  if (!txs || txs.length === 0) return false;
  return txs.every(
    (tx) =>
      tx.claim_tx?.tx_hex &&
      tx.payout_tx?.tx_hex &&
      tx.claim_tx.tx_hex.length > 0 &&
      tx.payout_tx.tx_hex.length > 0,
  );
}

/**
 * Identify which deposits need polling based on their status
 *
 * Criteria: PENDING contract status, not yet signed, have required data
 */
export function getDepositsNeedingPolling(
  activities: VaultActivity[],
  pendingPegins: PendingPeginRequest[],
  btcPublicKey?: string,
): DepositToPoll[] {
  return activities
    .map((activity) => {
      const pendingPegin = pendingPegins.find((p) => p.id === activity.id);
      const contractStatus = (activity.contractStatus ?? 0) as ContractStatus;
      const localStatus = pendingPegin?.status as
        | LocalStorageStatus
        | undefined;
      // Note: Currently only single vault provider per deposit is supported
      const vaultProviderAddress = activity.providers[0]?.id as Hex | undefined;

      // Check if this deposit should be polled
      const shouldPoll =
        contractStatus === ContractStatus.PENDING &&
        localStatus !== LocalStorageStatus.PAYOUT_SIGNED &&
        !!btcPublicKey &&
        !!vaultProviderAddress &&
        !!activity.txHash &&
        !!activity.applicationController &&
        isVaultOwnedByWallet(activity.depositorBtcPubkey, btcPublicKey);

      return {
        activity,
        pendingPegin,
        shouldPoll,
        vaultProviderAddress,
      };
    })
    .filter((d) => d.shouldPoll);
}

/**
 * Group deposits by vault provider URL for batched RPC calls
 */
export function groupDepositsByProvider(
  depositsToPoll: DepositToPoll[],
  vaultProviders: VaultProvider[],
): Map<string, DepositsByProvider> {
  const grouped = new Map<string, DepositsByProvider>();

  for (const deposit of depositsToPoll) {
    const provider = vaultProviders.find(
      (p) => p.id.toLowerCase() === deposit.vaultProviderAddress?.toLowerCase(),
    );

    if (!provider?.url) continue;

    const existing = grouped.get(provider.url);
    if (existing) {
      existing.deposits.push(deposit);
    } else {
      grouped.set(provider.url, {
        providerUrl: provider.url,
        deposits: [deposit],
      });
    }
  }

  return grouped;
}
