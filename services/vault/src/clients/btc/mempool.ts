/**
 * Mempool API Client for Bitcoin Network
 *
 * Simple client for fetching UTXOs and other Bitcoin data from mempool.space API.
 * This is a temporary location - will be migrated to when moving to main branch.
 */

import type { NetworkFees } from "../../types/fee";

import { getMempoolApiUrl } from "./config";

/**
 * UTXO from mempool API with confirmation status
 */
export interface MempoolUTXO {
  txid: string;
  vout: number;
  value: number;
  scriptPubKey: string;
  confirmed: boolean;
}

/**
 * Fetch wrapper with error handling
 */
async function fetchApi<T>(url: string, options?: RequestInit): Promise<T> {
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
 * Retrieve UTXOs for a Bitcoin address
 *
 * @param address - The Bitcoin address
 * @returns Promise resolving to array of UTXOs with confirmation status
 */
export async function getUTXOs(address: string): Promise<MempoolUTXO[]> {
  const apiUrl = getMempoolApiUrl();

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
 * Pushes a transaction to the Bitcoin network.
 *
 * TODO: Refactor to share common BTC utilities across routes in production
 *
 * @param txHex - The hex string corresponding to the full transaction.
 * @returns A promise that resolves to the transaction ID.
 */
export async function pushTx(txHex: string): Promise<string> {
  const apiUrl = getMempoolApiUrl();

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
      // Try to extract error message from response
      const message = errorText.split('"message":"')[1]?.split('"}')[0];
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
 * Transaction info response from mempool API
 *
 * NOTE: Copied from simple-staking for vault POC.
 * TODO: Deduplicate when merging vault to main branch.
 */
interface TxInfoResponse {
  txid: string;
  version: number;
  locktime: number;
  vin: {
    txid: string;
    vout: number;
    prevout: {
      scriptpubkey: string;
      scriptpubkey_asm: string;
      scriptpubkey_type: string;
      scriptpubkey_address: string;
      value: number;
    };
    scriptsig: string;
    scriptsig_asm: string;
    witness: string[];
    is_coinbase: boolean;
    sequence: number;
  }[];
  vout: {
    scriptpubkey: string;
    scriptpubkey_asm: string;
    scriptpubkey_type: string;
    scriptpubkey_address: string;
    value: number;
  }[];
  size: number;
  weight: number;
  fee: number;
  status: {
    confirmed: boolean;
    block_height: number;
    block_hash: string;
    block_time: number;
  };
}

/**
 * Retrieve information about a transaction from mempool API
 *
 * NOTE: Copied from simple-staking for vault POC.
 * TODO: Deduplicate when merging vault to main branch.
 *
 * @param txId - The transaction ID in string format
 * @returns Promise resolving to transaction information
 */
export async function getTxInfo(txId: string): Promise<TxInfoResponse> {
  const apiUrl = getMempoolApiUrl();

  return fetchApi<TxInfoResponse>(`${apiUrl}/tx/${txId}`);
}

/**
 * Retrieve the hex representation of a transaction from mempool API
 *
 * NOTE: Copied from simple-staking for vault POC.
 * TODO: Deduplicate when merging vault to main branch.
 *
 * @param txId - The transaction ID in string format
 * @returns Promise resolving to the transaction hex string
 */
export async function getTxHex(txId: string): Promise<string> {
  const apiUrl = getMempoolApiUrl();

  const response = await fetch(`${apiUrl}/tx/${txId}/hex`);

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Mempool API error (${response.status}): ${errorText || response.statusText}`,
    );
  }

  return await response.text();
}

/**
 * Fetches Bitcoin network fee recommendations from mempool.space API.
 *
 * @returns Fee rates in sat/vbyte for different confirmation times
 * @throws Error if request fails or returns invalid data
 *
 * @see https://mempool.space/docs/api/rest#get-recommended-fees
 */
export async function getNetworkFees(): Promise<NetworkFees> {
  const apiUrl = getMempoolApiUrl();

  const response = await fetch(`${apiUrl}/v1/fees/recommended`);

  if (!response.ok) {
    throw new Error(
      `Failed to fetch network fees: ${response.status} ${response.statusText}`,
    );
  }

  const data = await response.json();

  if (
    typeof data.fastestFee !== "number" ||
    typeof data.halfHourFee !== "number" ||
    typeof data.hourFee !== "number" ||
    typeof data.economyFee !== "number" ||
    typeof data.minimumFee !== "number"
  ) {
    throw new Error(
      "Invalid fee data structure from mempool API. Expected all fee fields to be numbers.",
    );
  }

  return data as NetworkFees;
}
