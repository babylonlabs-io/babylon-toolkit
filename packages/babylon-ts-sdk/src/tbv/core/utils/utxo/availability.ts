/**
 * UTXO Availability Validation
 *
 * Validates that UTXOs referenced in a pre-pegin transaction are still unspent
 * BEFORE asking the user to sign. This prevents wasted signing effort when
 * UTXOs have already been spent by unrelated transactions.
 *
 * These functions are pure — they accept pre-fetched UTXOs and perform no I/O.
 * The vault service wrapper is responsible for fetching UTXOs from the mempool.
 */

import { Transaction } from "bitcoinjs-lib";
import { Buffer } from "buffer";

import type { UtxoRef } from "./reservation";

/**
 * Information about a missing/spent UTXO.
 */
export interface MissingUtxoInfo {
  /** Transaction ID of the missing UTXO */
  txid: string;
  /** Output index of the missing UTXO */
  vout: number;
}

/**
 * Result of UTXO validation.
 */
export interface UtxoValidationResult {
  /** Whether all UTXOs are still available */
  allAvailable: boolean;
  /** List of missing UTXOs (if any) */
  missingUtxos: MissingUtxoInfo[];
  /** Total number of inputs checked */
  totalInputs: number;
}

/**
 * Error thrown when UTXOs are not available.
 */
export class UtxoNotAvailableError extends Error {
  public readonly missingUtxos: MissingUtxoInfo[];

  constructor(missingUtxos: MissingUtxoInfo[]) {
    const count = missingUtxos.length;
    const message =
      count === 1
        ? "The UTXO for this peg-in is no longer available. It may have been spent in another transaction. Please create a new peg-in request with a different UTXO."
        : `${count} UTXOs for this peg-in are no longer available. They may have been spent. Please create a new peg-in request with different UTXOs.`;

    super(message);
    this.name = "UtxoNotAvailableError";
    this.missingUtxos = missingUtxos;
  }
}

/**
 * Extract input references (txid:vout) from an unsigned transaction.
 *
 * @param unsignedTxHex - Unsigned transaction hex
 * @returns Array of input references
 */
export function extractInputsFromTransaction(
  unsignedTxHex: string,
): Array<{ txid: string; vout: number }> {
  const cleanHex = unsignedTxHex.startsWith("0x")
    ? unsignedTxHex.slice(2)
    : unsignedTxHex;

  let tx: Transaction;
  try {
    tx = Transaction.fromHex(cleanHex);
  } catch (error) {
    throw new Error(
      `Failed to parse BTC transaction: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  return tx.ins.map((input) => ({
    // Bitcoin stores txid in reverse byte order
    txid: Buffer.from(input.hash).reverse().toString("hex"),
    vout: input.index,
  }));
}

/**
 * Validate that all UTXOs in a transaction are still available.
 *
 * Pure function — accepts pre-fetched UTXOs instead of making network calls.
 * This should be called BEFORE signing to avoid wasting user effort
 * signing a transaction that will fail to broadcast.
 *
 * @param unsignedTxHex - Unsigned transaction hex
 * @param availableUtxos - Pre-fetched list of available UTXOs for the depositor
 * @returns Validation result with missing UTXO details
 */
export function validateUtxosAvailable(
  unsignedTxHex: string,
  availableUtxos: UtxoRef[],
): UtxoValidationResult {
  const inputs = extractInputsFromTransaction(unsignedTxHex);

  if (inputs.length === 0) {
    throw new Error("Transaction has no inputs");
  }

  // Create a set of available UTXOs for O(1) lookup (lowercase for consistency with reservation.ts)
  const availableSet = new Set(
    availableUtxos.map((utxo) => `${utxo.txid.toLowerCase()}:${utxo.vout}`),
  );

  // Check which inputs are missing
  const missingUtxos: MissingUtxoInfo[] = [];
  for (const input of inputs) {
    const key = `${input.txid.toLowerCase()}:${input.vout}`;
    if (!availableSet.has(key)) {
      missingUtxos.push({
        txid: input.txid,
        vout: input.vout,
      });
    }
  }

  return {
    allAvailable: missingUtxos.length === 0,
    missingUtxos,
    totalInputs: inputs.length,
  };
}

/**
 * Validate UTXOs and throw if any are not available.
 *
 * Pure convenience function that combines validation and error throwing.
 *
 * @param unsignedTxHex - Unsigned transaction hex
 * @param availableUtxos - Pre-fetched list of available UTXOs for the depositor
 * @throws UtxoNotAvailableError if any UTXOs are not available
 * @throws Error if validation fails
 */
export function assertUtxosAvailable(
  unsignedTxHex: string,
  availableUtxos: UtxoRef[],
): void {
  const result = validateUtxosAvailable(unsignedTxHex, availableUtxos);

  if (!result.allAvailable) {
    throw new UtxoNotAvailableError(result.missingUtxos);
  }
}
