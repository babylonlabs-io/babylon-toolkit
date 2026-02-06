/**
 * useUtxoValidation Hook
 *
 * Validates UTXO availability for pending broadcast deposits.
 * Accepts pre-fetched UTXOs to leverage React Query caching.
 *
 * This hook is designed to be used in PeginPollingContext to
 * proactively detect spent UTXOs before users attempt to broadcast.
 */

import type { MempoolUTXO } from "@babylonlabs-io/ts-sdk";
import { useMemo } from "react";

import {
  ContractStatus,
  LocalStorageStatus,
} from "../../models/peginStateMachine";
import { extractInputsFromTransaction } from "../../services/vault/vaultUtxoValidationService";
import type { PendingPeginRequest } from "../../storage/peginStorage";
import type { VaultActivity } from "../../types/activity";
import { isVaultOwnedByWallet } from "../../utils/vaultWarnings";

export interface UseUtxoValidationProps {
  /** All vault activities */
  activities: VaultActivity[];
  /** Pending pegins from localStorage */
  pendingPegins: PendingPeginRequest[];
  /** Connected wallet's BTC public key */
  btcPublicKey?: string;
  /** Pre-fetched UTXOs from useUTXOs hook (uses React Query caching) */
  availableUtxos?: MempoolUTXO[];
}

export interface UseUtxoValidationResult {
  /** Set of deposit IDs with unavailable UTXOs */
  unavailableUtxos: Set<string>;
}

/**
 * Filter activities to those pending broadcast and owned by current wallet.
 * Uses O(1) lookup for pending pegin statuses.
 */
function getPendingBroadcastDeposits(
  activities: VaultActivity[],
  pendingPeginStatusMap: Map<string, LocalStorageStatus | undefined>,
  btcPublicKey: string,
): VaultActivity[] {
  return activities.filter((activity) => {
    // Must be owned by current wallet
    if (!isVaultOwnedByWallet(activity.depositorBtcPubkey, btcPublicKey)) {
      return false;
    }

    // Must be in VERIFIED state (pending broadcast)
    const contractStatus = (activity.contractStatus ?? 0) as ContractStatus;
    if (contractStatus !== ContractStatus.VERIFIED) {
      return false;
    }

    // Skip if already confirming (tx was broadcasted)
    const status = pendingPeginStatusMap.get(activity.id);
    if (status === LocalStorageStatus.CONFIRMING) {
      return false;
    }

    // Must have unsigned tx for validation
    return !!activity.unsignedBtcTx;
  });
}

/**
 * Hook to validate UTXO availability for pending broadcast deposits.
 *
 * Accepts pre-fetched UTXOs from useUTXOs hook to leverage React Query
 * caching with 30-second staleTime, avoiding duplicate API calls.
 */
export function useUtxoValidation({
  activities,
  pendingPegins,
  btcPublicKey,
  availableUtxos,
}: UseUtxoValidationProps): UseUtxoValidationResult {
  const unavailableUtxos = useMemo(() => {
    // Skip validation if missing required data.
    // Note: undefined means "not loaded yet" (skip validation),
    // while [] means "loaded but wallet has no UTXOs" (validate normally).
    // Callers should pass undefined while loading to avoid false positives.
    if (!btcPublicKey || !availableUtxos) {
      return new Set<string>();
    }

    // Precompute status map for O(1) lookups (avoids O(N*M) in filter)
    const pendingPeginStatusMap = new Map(
      pendingPegins.map((p) => [p.id, p.status]),
    );

    const pendingBroadcasts = getPendingBroadcastDeposits(
      activities,
      pendingPeginStatusMap,
      btcPublicKey,
    );

    if (pendingBroadcasts.length === 0) {
      return new Set<string>();
    }

    // Build a set of available UTXOs for O(1) lookup
    const availableUtxoSet = new Set(
      availableUtxos.map((utxo) => `${utxo.txid}:${utxo.vout}`),
    );

    // Check each deposit's inputs against available UTXOs
    const unavailable = new Set<string>();

    for (const deposit of pendingBroadcasts) {
      try {
        const inputs = extractInputsFromTransaction(deposit.unsignedBtcTx!);

        // If any input is not in the available set, mark deposit as unavailable
        const hasUnavailableInput = inputs.some(
          (input) => !availableUtxoSet.has(`${input.txid}:${input.vout}`),
        );

        if (hasUnavailableInput) {
          unavailable.add(deposit.id);
        }
      } catch (error) {
        // Skip deposits with invalid transaction hex
        console.warn(
          `[useUtxoValidation] Failed to parse tx for ${deposit.id}:`,
          error,
        );
      }
    }

    return unavailable;
  }, [activities, pendingPegins, btcPublicKey, availableUtxos]);

  return { unavailableUtxos };
}
