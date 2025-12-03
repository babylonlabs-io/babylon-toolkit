/**
 * Mempool API Client
 *
 * Client for interacting with mempool.space API for Bitcoin network operations.
 * Used for broadcasting transactions and fetching UTXO data.
 *
 * @module clients/mempool/mempoolApi
 */

import type { MempoolUTXO, TxInfo, UtxoInfo } from "./types";

/**
 * Default mempool API URLs by network.
 */
export const MEMPOOL_API_URLS = {
  mainnet: "https://mempool.space/api",
  testnet: "https://mempool.space/testnet/api",
  signet: "https://mempool.space/signet/api",
} as const;

/**
 * Fetch wrapper with error handling.
 */
async function fetchApi<T>(
  url: string,
  options?: RequestInit,
): Promise<T> {
  try {
    const response = await fetch(url, options);

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `Mempool API error (${response.status}): ${errorText || response.statusText}`,
      );
    }

    const contentType = response.headers.get("content-type");
    if (contentType?.includes("application/json")) {
      return (await response.json()) as T;
    } else {
      return (await response.text()) as T;
    }
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Failed to fetch from mempool API: ${error.message}`);
    }
    throw new Error("Failed to fetch from mempool API: Unknown error");
  }
}

/**
 * Push a signed transaction to the Bitcoin network.
 *
 * @param txHex - The signed transaction hex string
 * @param apiUrl - Mempool API base URL
 * @returns The transaction ID
 * @throws Error if broadcasting fails
 */
export async function pushTx(txHex: string, apiUrl: string): Promise<string> {
  try {
    const response = await fetch(`${apiUrl}/tx`, {
      method: "POST",
      body: txHex,
      headers: {
        "Content-Type": "text/plain",
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      // Try to extract error message from response using robust JSON parsing
      let message: string | undefined;
      try {
        const errorJson = JSON.parse(errorText);
        message = errorJson.message;
      } catch {
        // Not JSON, use raw text
        message = errorText;
      }
      throw new Error(
        message || `Failed to broadcast transaction: ${response.statusText}`,
      );
    }

    // Response is the transaction ID (plain text)
    const txId = await response.text();
    return txId;
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Failed to broadcast BTC transaction: ${error.message}`);
    }
    throw new Error("Failed to broadcast BTC transaction: Unknown error");
  }
}

/**
 * Get transaction information from mempool.
 *
 * @param txid - The transaction ID
 * @param apiUrl - Mempool API base URL
 * @returns Transaction information
 */
export async function getTxInfo(txid: string, apiUrl: string): Promise<TxInfo> {
  return fetchApi<TxInfo>(`${apiUrl}/tx/${txid}`);
}

/**
 * Get the hex representation of a transaction.
 *
 * @param txid - The transaction ID
 * @param apiUrl - Mempool API base URL
 * @returns The transaction hex string
 * @throws Error if the request fails or transaction is not found
 */
export async function getTxHex(txid: string, apiUrl: string): Promise<string> {
  try {
    const response = await fetch(`${apiUrl}/tx/${txid}/hex`);

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `Mempool API error (${response.status}): ${errorText || response.statusText}`,
      );
    }

    return await response.text();
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Failed to get transaction hex for ${txid}: ${error.message}`);
    }
    throw new Error(`Failed to get transaction hex for ${txid}: Unknown error`);
  }
}

/**
 * Get UTXO information for a specific transaction output.
 *
 * This is used for constructing PSBTs where we need the witnessUtxo data.
 * Only supports Taproot (P2TR) and native SegWit (P2WPKH, P2WSH) script types.
 *
 * @param txid - The transaction ID containing the UTXO
 * @param vout - The output index
 * @param apiUrl - Mempool API base URL
 * @returns UTXO information with value and scriptPubKey
 */
export async function getUtxoInfo(
  txid: string,
  vout: number,
  apiUrl: string,
): Promise<UtxoInfo> {
  const txInfo = await getTxInfo(txid, apiUrl);

  if (vout >= txInfo.vout.length) {
    throw new Error(
      `Invalid vout ${vout} for transaction ${txid} (has ${txInfo.vout.length} outputs)`,
    );
  }

  const output = txInfo.vout[vout];

  return {
    txid,
    vout,
    value: output.value,
    scriptPubKey: output.scriptpubkey,
  };
}

/**
 * Get all UTXOs for a Bitcoin address.
 *
 * @param address - The Bitcoin address
 * @param apiUrl - Mempool API base URL
 * @returns Array of UTXOs sorted by value (largest first)
 */
export async function getAddressUtxos(
  address: string,
  apiUrl: string,
): Promise<MempoolUTXO[]> {
  try {
    // Fetch UTXOs for the address
    const utxos = await fetchApi<
      {
        txid: string;
        vout: number;
        value: number;
        status: {
          confirmed: boolean;
        };
      }[]
    >(`${apiUrl}/address/${address}/utxo`);

    // Fetch scriptPubKey for the address
    const addressInfo = await fetchApi<{
      isvalid: boolean;
      scriptPubKey: string;
    }>(`${apiUrl}/v1/validate-address/${address}`);

    if (!addressInfo.isvalid) {
      throw new Error(
        `Invalid Bitcoin address: ${address}. Mempool API validation failed.`,
      );
    }

    // Sort by value (largest first) and map to our UTXO format
    const sortedUTXOs = utxos.sort((a, b) => b.value - a.value);

    return sortedUTXOs.map((utxo) => ({
      txid: utxo.txid,
      vout: utxo.vout,
      value: utxo.value,
      scriptPubKey: addressInfo.scriptPubKey,
      confirmed: utxo.status.confirmed,
    }));
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(
        `Failed to get UTXOs for address ${address}: ${error.message}`,
      );
    }
    throw new Error(
      `Failed to get UTXOs for address ${address}: Unknown error`,
    );
  }
}

/**
 * Get the mempool API URL for a given network.
 *
 * @param network - Bitcoin network (mainnet, testnet, signet)
 * @returns The mempool API URL
 */
export function getMempoolApiUrl(
  network: "mainnet" | "testnet" | "signet",
): string {
  return MEMPOOL_API_URLS[network];
}

