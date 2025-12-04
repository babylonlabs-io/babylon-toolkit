/**
 * UTXO Derivation Service
 *
 * Derives UTXO information from unsigned Bitcoin transactions by:
 * 1. Parsing the unsigned transaction to extract input references (txid, vout)
 * 2. Querying mempool API to get full UTXO data (scriptPubKey, value)
 *
 * This enables cross-device pegin broadcasting without localStorage dependency.
 *
 * NOTE: Mempool API calls copied from simple-staking for vault POC.
 * TODO: Deduplicate when merging vault to main branch.
 */

import { Transaction } from "bitcoinjs-lib";
import { Buffer } from "buffer";

import { getTxInfo } from "../../clients/btc/mempool";

import type { UTXOInfo } from "./vaultPeginBroadcastService";

/**
 * Derive UTXO information from an unsigned Bitcoin transaction
 *
 * This function enables cross-device pegin support by reconstructing UTXO data
 * from the unsigned transaction hex (stored in ETH contract) + mempool API queries.
 *
 * Process:
 * 1. Parse unsigned TX to get input reference (txid, vout)
 * 2. Fetch full transaction data from mempool API
 * 3. Extract UTXO details (scriptPubKey, value) from the referenced output
 *
 * @param unsignedTxHex - Unsigned transaction hex (from ETH contract)
 * @returns UTXO information needed for PSBT construction
 * @throws Error if transaction parsing fails or UTXO not found in mempool
 */
export async function deriveUTXOFromUnsignedTx(
  unsignedTxHex: string,
): Promise<UTXOInfo> {
  try {
    // Step 1: Parse unsigned transaction to extract input reference
    const cleanHex = unsignedTxHex.startsWith("0x")
      ? unsignedTxHex.slice(2)
      : unsignedTxHex;

    const tx = Transaction.fromHex(cleanHex);

    if (tx.ins.length === 0) {
      throw new Error("Transaction has no inputs");
    }

    // Extract first input
    // Note: This function is kept for backward compatibility and simple cases
    // For transactions with multiple inputs, use fetchUTXOFromMempool directly
    const input = tx.ins[0];

    // Bitcoin stores txid in reverse byte order
    const txid = Buffer.from(input.hash).reverse().toString("hex");
    const vout = input.index;

    // Step 2: Fetch full UTXO data from mempool API
    const utxoData = await fetchUTXOFromMempool(txid, vout);

    return {
      txid,
      vout,
      value: BigInt(utxoData.value),
      scriptPubKey: utxoData.scriptPubKey,
    };
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(
        `Failed to derive UTXO from unsigned transaction: ${error.message}`,
      );
    }
    throw new Error(
      "Failed to derive UTXO from unsigned transaction: Unknown error",
    );
  }
}

/**
 * Fetch UTXO data from mempool API
 *
 * Queries mempool.space API to get full transaction data and extract
 * the specific output (UTXO) being spent.
 *
 * @param txid - Transaction ID containing the UTXO
 * @param vout - Output index of the UTXO
 * @returns UTXO data with scriptPubKey and value
 * @throws Error if transaction not found or output index invalid
 */
export async function fetchUTXOFromMempool(
  txid: string,
  vout: number,
): Promise<{ scriptPubKey: string; value: number }> {
  try {
    // Fetch transaction info from mempool API
    const txInfo = await getTxInfo(txid);

    // Validate output index
    if (vout >= txInfo.vout.length) {
      throw new Error(
        `Invalid output index ${vout}. Transaction ${txid} only has ${txInfo.vout.length} outputs.`,
      );
    }

    // Extract output data
    const output = txInfo.vout[vout];

    if (!output) {
      throw new Error(
        `Output ${vout} not found in transaction ${txid}. This should not happen after validation.`,
      );
    }

    return {
      scriptPubKey: output.scriptpubkey,
      value: output.value,
    };
  } catch (error) {
    if (error instanceof Error) {
      // Check for common error cases and provide helpful messages
      if (
        error.message.includes("404") ||
        error.message.includes("not found")
      ) {
        throw new Error(
          `Transaction ${txid} not found in mempool. The UTXO may have been spent or the transaction is not yet confirmed. Please try again later or contact support.`,
        );
      }

      throw new Error(`Failed to fetch UTXO from mempool: ${error.message}`);
    }
    throw new Error("Failed to fetch UTXO from mempool: Unknown error");
  }
}
