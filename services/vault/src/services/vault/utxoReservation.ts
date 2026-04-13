/**
 * UTXO reservation utilities for vault deposits.
 *
 * Handles tracking which UTXOs are already in use by pending deposits
 * and selecting available UTXOs with smart fallback logic.
 */

import {
  FEE_SAFETY_MARGIN,
  MAX_NON_LEGACY_OUTPUT_SIZE,
  P2TR_INPUT_SIZE,
  TX_BUFFER_SIZE_OVERHEAD,
} from "@babylonlabs-io/ts-sdk/tbv/core";
import { Transaction } from "bitcoinjs-lib";
import { Buffer } from "buffer";

import { ContractStatus } from "../../models/peginStateMachine";
import type { PendingPeginRequest } from "../../storage/peginStorage";
import type { Vault } from "../../types/vault";
import { stripHexPrefix } from "../../utils/btc/btcUtils";

// ============================================================================
// Types
// ============================================================================

/** A txid:vout pair uniquely identifying a UTXO (outpoint). */
export interface UtxoRef {
  txid: string;
  vout: number;
}

export interface SelectUtxosForDepositParams<
  T extends { txid: string; vout: number; value: number },
> {
  /** All available UTXOs from the wallet. */
  availableUtxos: T[];
  /** UTXOs that are reserved/in-flight and should be avoided if possible. */
  reservedUtxoRefs: UtxoRef[];
  /** Required deposit amount in satoshis (excluding fees). */
  requiredAmount: bigint;
  /** Fee rate in sat/vB. Used to estimate fee buffer for sufficiency check. */
  feeRate: number;
}

export interface CollectReservedUtxoRefsParams {
  vaults?: Vault[];
  pendingPegins?: PendingPeginRequest[];
}

// ============================================================================
// Internal Helpers
// ============================================================================

/** Parse a transaction hex and return the UTXO references of all inputs. */
function extractInputUtxoRefs(txHex: string): UtxoRef[] {
  try {
    const tx = Transaction.fromHex(stripHexPrefix(txHex));
    return tx.ins.map((input) => {
      const txid = Buffer.from(input.hash).reverse().toString("hex");
      return { txid, vout: input.index };
    });
  } catch {
    return [];
  }
}

/** Check if a UTXO matches any reserved ref (case-insensitive txid comparison). */
function isUtxoReserved(
  utxo: { txid: string; vout: number },
  reservedRefs: UtxoRef[],
): boolean {
  const txidLower = utxo.txid.toLowerCase();
  return reservedRefs.some(
    (ref) => ref.txid.toLowerCase() === txidLower && ref.vout === utxo.vout,
  );
}

/**
 * Estimate minimum fee buffer for UTXO pre-selection.
 *
 * WARNING: This is a ROUGH ESTIMATE used only to check if unreserved UTXOs
 * are likely sufficient BEFORE the actual signing flow begins. The actual
 * fee calculation happens in the SDK's `selectUtxosForPegin` during signing.
 *
 * Assumptions:
 * - 2 inputs (conservative estimate for most deposits)
 * - 1 vault output (P2TR, 43 vBytes)
 * - 1 change output (P2TR, 43 vBytes)
 * - Transaction overhead (11 vBytes)
 * - 10% safety margin
 *
 */
function estimateMinimumFeeBuffer(feeRate: number): bigint {
  const ASSUMED_INPUTS = 2;

  const estimatedTxSize =
    ASSUMED_INPUTS * P2TR_INPUT_SIZE +
    MAX_NON_LEGACY_OUTPUT_SIZE + // vault output
    MAX_NON_LEGACY_OUTPUT_SIZE + // change output
    TX_BUFFER_SIZE_OVERHEAD;

  const estimatedFee = Math.ceil(estimatedTxSize * feeRate * FEE_SAFETY_MARGIN);
  return BigInt(estimatedFee);
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Collect UTXO refs from in-flight deposits (PENDING/VERIFIED vaults and localStorage).
 */
export function collectReservedUtxoRefs(
  params: CollectReservedUtxoRefsParams,
): UtxoRef[] {
  const reserved: UtxoRef[] = [];
  const { vaults = [], pendingPegins = [] } = params;

  // Collect from pending pegins in localStorage
  for (const pending of pendingPegins) {
    if (pending.selectedUTXOs && pending.selectedUTXOs.length > 0) {
      for (const utxo of pending.selectedUTXOs) {
        reserved.push({ txid: utxo.txid, vout: utxo.vout });
      }
    } else if (pending.unsignedTxHex) {
      reserved.push(...extractInputUtxoRefs(pending.unsignedTxHex));
    }
  }

  // Collect from PENDING/VERIFIED vaults
  for (const vault of vaults) {
    if (
      vault.status !== ContractStatus.PENDING &&
      vault.status !== ContractStatus.VERIFIED
    ) {
      continue;
    }
    reserved.push(...extractInputUtxoRefs(vault.unsignedPrePeginTx));
  }

  return reserved;
}

/**
 * Select UTXOs for a deposit, filtering out reserved ones.
 *
 * Logic:
 * 1. Filter out reserved UTXOs from the available pool
 * 2. If unreserved UTXOs are sufficient for the required amount + estimated fee, return them
 * 3. Otherwise, throw — never silently reuse reserved UTXOs, as this risks double-spend
 *    failures that strand registered-but-unbroadcastable vaults
 *
 * @param params - Selection parameters
 * @returns Array of unreserved UTXOs to use for the deposit
 * @throws When all UTXOs are reserved or unreserved UTXOs are insufficient
 */
export function selectUtxosForDeposit<
  T extends { txid: string; vout: number; value: number },
>(params: SelectUtxosForDepositParams<T>): T[] {
  const { availableUtxos, reservedUtxoRefs, requiredAmount, feeRate } = params;

  // Edge case: no UTXOs available
  if (!availableUtxos || availableUtxos.length === 0) {
    return [];
  }

  // Edge case: no reservations, return all
  if (reservedUtxoRefs.length === 0) {
    return availableUtxos;
  }

  // Filter out reserved UTXOs
  const unreserved = availableUtxos.filter(
    (utxo) => !isUtxoReserved(utxo, reservedUtxoRefs),
  );

  if (unreserved.length === 0) {
    throw new Error(
      "All available UTXOs are reserved by pending deposits. " +
        "Wait for pending deposits to confirm or cancel them before starting a new deposit.",
    );
  }

  const feeBuffer = estimateMinimumFeeBuffer(feeRate);
  const totalRequired = requiredAmount + feeBuffer;
  const unreservedTotal = unreserved.reduce(
    (sum, u) => sum + BigInt(u.value),
    0n,
  );
  if (unreservedTotal < totalRequired) {
    throw new Error(
      "Insufficient unreserved UTXOs for this deposit amount. " +
        "Wait for pending deposits to confirm or cancel them.",
    );
  }

  return unreserved;
}
