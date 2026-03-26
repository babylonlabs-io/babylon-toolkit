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
import { calculateBtcTxHash } from "@babylonlabs-io/ts-sdk/tbv/core";
import { useMemo } from "react";

import { logger } from "@/infrastructure";

import { ContractStatus } from "../../models/peginStateMachine";
import { extractInputsFromTransaction } from "../../services/vault/vaultUtxoValidationService";
import type { VaultActivity } from "../../types/activity";
import { stripHexPrefix } from "../../utils/btc";
import { isVaultOwnedByWallet } from "../../utils/vaultWarnings";

export interface UseUtxoValidationProps {
  /** All vault activities */
  activities: VaultActivity[];
  /** Connected wallet's BTC public key */
  btcPublicKey?: string;
  /** Pre-fetched UTXOs from useUTXOs hook (uses React Query caching) */
  availableUtxos?: MempoolUTXO[];
  /** Set of txids that have been broadcast to Bitcoin (mempool + recent confirmed) */
  broadcastedTxIds?: Set<string>;
}

export interface UseUtxoValidationResult {
  /** Set of deposit IDs with unavailable UTXOs */
  unavailableUtxos: Set<string>;
}

/**
 * Filter activities to those with UTXOs that need validation.
 * Includes both PENDING and VERIFIED deposits — a PENDING deposit's
 * UTXO can already be spent by another transaction before it reaches
 * VERIFIED, so we detect the conflict early.
 */
function getDepositsForUtxoValidation(
  activities: VaultActivity[],
  btcPublicKey: string,
): VaultActivity[] {
  return activities.filter((activity) => {
    // Must be owned by current wallet
    if (!isVaultOwnedByWallet(activity.depositorBtcPubkey, btcPublicKey)) {
      return false;
    }

    // Must be in PENDING or VERIFIED state (pre-activation)
    const contractStatus = (activity.contractStatus ?? 0) as ContractStatus;
    if (
      contractStatus !== ContractStatus.PENDING &&
      contractStatus !== ContractStatus.VERIFIED
    ) {
      return false;
    }

    // Must have pre-pegin tx (the tx that spends wallet UTXOs) for validation
    return !!activity.unsignedPrePeginTx;
  });
}

export function useUtxoValidation({
  activities,
  btcPublicKey,
  availableUtxos,
  broadcastedTxIds,
}: UseUtxoValidationProps): UseUtxoValidationResult {
  const unavailableUtxos = useMemo(() => {
    // Skip validation if missing required data.
    // Note: undefined means "not loaded yet" (skip validation),
    // while [] means "loaded but wallet has no UTXOs" (validate normally).
    // Callers should pass undefined while loading to avoid false positives.
    if (!btcPublicKey || !availableUtxos) {
      return new Set<string>();
    }

    const depositsToValidate = getDepositsForUtxoValidation(
      activities,
      btcPublicKey,
    );

    if (depositsToValidate.length === 0) {
      return new Set<string>();
    }

    // Build a set of available UTXOs for O(1) lookup
    const availableUtxoSet = new Set(
      availableUtxos.map((utxo) => `${utxo.txid}:${utxo.vout}`),
    );

    // Check each deposit's inputs against available UTXOs
    const unavailable = new Set<string>();

    for (const deposit of depositsToValidate) {
      try {
        const inputs = extractInputsFromTransaction(
          deposit.unsignedPrePeginTx!,
        );

        // If any input is not in the available set, check if it was spent by vault's own tx
        const hasUnavailableInput = inputs.some(
          (input) => !availableUtxoSet.has(`${input.txid}:${input.vout}`),
        );

        if (hasUnavailableInput) {
          // In the atomic swap flow, deposit.id is the PegIn tx hash but the tx
          // that actually spends wallet UTXOs is the Pre-PegIn tx (a different ID).
          // Check both so a confirming deposit is not falsely marked as Invalid.
          const peginTxId = stripHexPrefix(deposit.id).toLowerCase();
          const prePeginTxId = stripHexPrefix(
            calculateBtcTxHash(deposit.unsignedPrePeginTx!),
          ).toLowerCase();
          const isBroadcasted =
            (broadcastedTxIds?.has(peginTxId) ?? false) ||
            (broadcastedTxIds?.has(prePeginTxId) ?? false);

          if (!isBroadcasted) {
            // UTXO spent by a different transaction - truly unavailable
            unavailable.add(deposit.id);
          }
          // If broadcasted, skip adding to unavailable - it's confirming
        }
      } catch (error) {
        logger.warn(
          `[useUtxoValidation] Failed to parse tx for ${deposit.id}`,
          {
            data: {
              error: error instanceof Error ? error.message : String(error),
            },
          },
        );
      }
    }

    return unavailable;
  }, [activities, btcPublicKey, availableUtxos, broadcastedTxIds]);

  return { unavailableUtxos };
}
