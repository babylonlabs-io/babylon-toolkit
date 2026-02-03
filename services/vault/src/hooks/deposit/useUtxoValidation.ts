/**
 * useUtxoValidation Hook
 *
 * Validates UTXO availability for pending broadcast deposits.
 * Runs on mount and when dependencies change.
 *
 * This hook is designed to be used in PeginPollingContext to
 * proactively detect spent UTXOs before users attempt to broadcast.
 */

import { useEffect, useState } from "react";

import {
  ContractStatus,
  LocalStorageStatus,
} from "../../models/peginStateMachine";
import {
  extractInputsFromTransaction,
  fetchAvailableUtxoSet,
} from "../../services/vault/vaultUtxoValidationService";
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
  /** Connected wallet's BTC address */
  btcAddress?: string;
}

export interface UseUtxoValidationResult {
  /** Set of deposit IDs with unavailable UTXOs */
  unavailableUtxos: Set<string>;
}

/**
 * Filter activities to those pending broadcast and owned by current wallet
 */
function getPendingBroadcastDeposits(
  activities: VaultActivity[],
  pendingPegins: PendingPeginRequest[],
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
    const pendingPegin = pendingPegins.find((p) => p.id === activity.id);
    if (pendingPegin?.status === LocalStorageStatus.CONFIRMING) {
      return false;
    }

    // Must have unsigned tx for validation
    return !!activity.unsignedBtcTx;
  });
}

/**
 * Hook to validate UTXO availability for pending broadcast deposits.
 *
 * Fetches the connected wallet's UTXOs once and checks all pending
 * deposits against that set.
 */
export function useUtxoValidation({
  activities,
  pendingPegins,
  btcPublicKey,
  btcAddress,
}: UseUtxoValidationProps): UseUtxoValidationResult {
  const [unavailableUtxos, setUnavailableUtxos] = useState<Set<string>>(
    new Set(),
  );

  useEffect(() => {
    if (!btcAddress || !btcPublicKey) {
      setUnavailableUtxos(new Set());
      return;
    }

    const pendingBroadcasts = getPendingBroadcastDeposits(
      activities,
      pendingPegins,
      btcPublicKey,
    );

    if (pendingBroadcasts.length === 0) {
      setUnavailableUtxos(new Set());
      return;
    }

    const validateUtxos = async () => {
      try {
        // Fetch available UTXOs once for the address
        const availableUtxoSet = await fetchAvailableUtxoSet(btcAddress);

        // Check each deposit's inputs against available UTXOs
        const unavailable = new Set<string>();

        for (const deposit of pendingBroadcasts) {
          const inputs = extractInputsFromTransaction(deposit.unsignedBtcTx!);

          // If any input is not in the available set, mark deposit as unavailable
          const hasUnavailableInput = inputs.some(
            (input) => !availableUtxoSet.has(`${input.txid}:${input.vout}`),
          );

          if (hasUnavailableInput) {
            unavailable.add(deposit.id);
          }
        }

        setUnavailableUtxos(unavailable);
      } catch (error) {
        console.warn("[useUtxoValidation] Validation failed:", error);
        // Don't block on errors - broadcast will handle it
      }
    };

    validateUtxos();
  }, [activities, pendingPegins, btcAddress, btcPublicKey]);

  return { unavailableUtxos };
}
