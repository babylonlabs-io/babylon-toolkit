/**
 * UTXO Derivation Service
 *
 * Fetches full UTXO data (scriptPubKey, value) from the mempool API.
 */

import { getUtxoInfo } from "@babylonlabs-io/ts-sdk";

import { getMempoolApiUrl } from "../../clients/btc/config";

/**
 * Fetch UTXO data from mempool API via the SDK's validated getUtxoInfo.
 *
 * Delegates to getUtxoInfo which validates txid format, vout bounds,
 * satoshi value range, and scriptPubKey format before returning.
 *
 * @param txid - Transaction ID containing the UTXO
 * @param vout - Output index of the UTXO
 * @returns UTXO data with scriptPubKey and value
 * @throws Error if transaction not found, output index invalid, or validation fails
 */
export async function fetchUTXOFromMempool(
  txid: string,
  vout: number,
): Promise<{ scriptPubKey: string; value: number }> {
  try {
    // Delegate to the SDK's getUtxoInfo which validates txid format,
    // vout bounds, satoshi value, and scriptPubKey format.
    const utxoInfo = await getUtxoInfo(txid, vout, getMempoolApiUrl());
    return {
      scriptPubKey: utxoInfo.scriptPubKey,
      value: utxoInfo.value,
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
