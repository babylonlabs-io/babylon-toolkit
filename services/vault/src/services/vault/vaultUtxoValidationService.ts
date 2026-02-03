/**
 * UTXO Validation Service
 *
 * Validates that UTXOs referenced in a peg-in transaction are still unspent
 * BEFORE asking the user to sign. This prevents wasted signing effort when
 * UTXOs have already been spent.
 *
 * Uses a simple approach: fetch the depositor's current UTXOs and verify
 * that the transaction inputs are still available.
 *
 * @see Audit finding BTV-047: Missing UTXO tracking before broadcast
 */

import { getAddressUtxos } from "@babylonlabs-io/ts-sdk";
import { Transaction } from "bitcoinjs-lib";
import { Buffer } from "buffer";

import { getMempoolApiUrl } from "../../clients/btc/config";

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
      `Failed to parse unsigned BTC transaction: ${error instanceof Error ? error.message : String(error)}`,
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
 * This should be called BEFORE signing to avoid wasting user effort
 * signing a transaction that will fail to broadcast.
 *
 * Uses a simple approach: fetches the depositor's current UTXOs and
 * checks if all transaction inputs are still in that set.
 *
 * @param unsignedTxHex - Unsigned transaction hex
 * @param depositorAddress - Depositor's Bitcoin address
 * @returns Validation result with missing UTXO details
 * @throws Error if mempool API call fails
 */
export async function validateUtxosAvailable(
  unsignedTxHex: string,
  depositorAddress: string,
): Promise<UtxoValidationResult> {
  const inputs = extractInputsFromTransaction(unsignedTxHex);

  if (inputs.length === 0) {
    throw new Error("Transaction has no inputs");
  }

  const mempoolUrl = getMempoolApiUrl();

  // Fetch current UTXOs for the depositor's address
  const availableUtxos = await getAddressUtxos(depositorAddress, mempoolUrl);

  // Create a set of available UTXOs for O(1) lookup
  const availableSet = new Set(
    availableUtxos.map((utxo) => `${utxo.txid}:${utxo.vout}`),
  );

  // Check which inputs are missing
  const missingUtxos: MissingUtxoInfo[] = [];
  for (const input of inputs) {
    const key = `${input.txid}:${input.vout}`;
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
 * Convenience function that combines validation and error throwing.
 *
 * @param unsignedTxHex - Unsigned transaction hex
 * @param depositorAddress - Depositor's Bitcoin address
 * @throws UtxoNotAvailableError if any UTXOs are not available
 * @throws Error if validation fails
 */
export async function assertUtxosAvailable(
  unsignedTxHex: string,
  depositorAddress: string,
): Promise<void> {
  const result = await validateUtxosAvailable(unsignedTxHex, depositorAddress);

  if (!result.allAvailable) {
    throw new UtxoNotAvailableError(result.missingUtxos);
  }
}

/**
 * Fetch available UTXOs for an address and return as a Set for O(1) lookup.
 *
 * @param depositorAddress - Depositor's Bitcoin address
 * @returns Set of available UTXO keys in "txid:vout" format
 */
export async function fetchAvailableUtxoSet(
  depositorAddress: string,
): Promise<Set<string>> {
  const mempoolUrl = getMempoolApiUrl();
  const availableUtxos = await getAddressUtxos(depositorAddress, mempoolUrl);

  return new Set(availableUtxos.map((utxo) => `${utxo.txid}:${utxo.vout}`));
}
