/**
 * Mempool API Client
 *
 * Client for interacting with mempool.space API for Bitcoin network operations.
 * Used for broadcasting transactions and fetching UTXO data.
 *
 * @module clients/mempool/mempoolApi
 */

import {
  BITCOIN_ADDRESS_RE,
  HEX_RE,
  KNOWN_SCRIPT_PREFIXES,
  TXID_RE,
} from "../../utils/validation";

import type { MempoolUTXO, NetworkFees, TxInfo, UtxoInfo } from "./types";

/** Maximum valid satoshi value: 21 million BTC × 10^8 sats/BTC */
const MAX_SATOSHIS = 21_000_000 * 1e8;

/** Timeout for mempool API requests — prevents indefinite hangs from stalled endpoints */
const MEMPOOL_REQUEST_TIMEOUT_MS = 30_000;

/**
 * Fetch wrapper with AbortController-based timeout.
 * Ensures all mempool API requests fail bounded rather than hanging indefinitely.
 */
async function fetchWithTimeout(
  url: string,
  options?: RequestInit,
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(
    () => controller.abort(),
    MEMPOOL_REQUEST_TIMEOUT_MS,
  );

  // Compose timeout signal with any caller-supplied signal so both can cancel
  const signals = [controller.signal, options?.signal].filter(
    Boolean,
  ) as AbortSignal[];

  try {
    // Don't clear timeout here — let it cover body consumption by callers
    return await fetch(url, {
      ...options,
      signal: AbortSignal.any(signals),
    });
  } catch (error) {
    clearTimeout(timeoutId);
    if (
      error != null &&
      typeof error === "object" &&
      "name" in error &&
      error.name === "AbortError"
    ) {
      throw new Error(
        `Mempool API request timed out after ${MEMPOOL_REQUEST_TIMEOUT_MS}ms: ${url}`,
      );
    }
    throw error;
  }
}

/**
 * Maximum sane fee rate in sat/vByte.
 * The April 2024 Runes spike peaked around 1,805 sat/vB — 10,000 provides ample headroom.
 */
const MAX_FEE_RATE = 10_000;

function isValidSatoshiValue(value: number): boolean {
  return Number.isInteger(value) && value > 0 && value <= MAX_SATOSHIS;
}

function isValidFeeRate(value: number): boolean {
  return Number.isInteger(value) && value > 0 && value <= MAX_FEE_RATE;
}

function isValidVout(vout: number, outputCount?: number): boolean {
  if (!Number.isInteger(vout) || vout < 0) return false;
  return outputCount === undefined || vout < outputCount;
}


function assertValidTxid(txid: string): void {
  if (!TXID_RE.test(txid)) {
    throw new Error(`Invalid transaction ID format: ${txid}`);
  }
}

function assertValidAddress(address: string): void {
  if (!BITCOIN_ADDRESS_RE.test(address)) {
    throw new Error(`Invalid Bitcoin address format: ${address}`);
  }
}

function assertValidScriptPubKey(scriptPubKey: string, context: string): void {
  if (!HEX_RE.test(scriptPubKey)) {
    throw new Error(
      `Invalid scriptPubKey: not valid hex for ${context}`,
    );
  }
  const matchesKnownType = KNOWN_SCRIPT_PREFIXES.some((prefix) =>
    scriptPubKey.toLowerCase().startsWith(prefix),
  );
  if (!matchesKnownType) {
    throw new Error(
      `Unrecognized scriptPubKey type for ${context}: ` +
        `prefix ${scriptPubKey.slice(0, 6)} does not match any known Bitcoin script type`,
    );
  }
}

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
    const response = await fetchWithTimeout(url, options);

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
    const response = await fetchWithTimeout(`${apiUrl}/tx`, {
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
  assertValidTxid(txid);
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
  assertValidTxid(txid);
  try {
    const response = await fetchWithTimeout(`${apiUrl}/tx/${txid}/hex`);

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
  assertValidTxid(txid);
  const txInfo = await getTxInfo(txid, apiUrl);

  if (!isValidVout(vout, txInfo.vout.length)) {
    throw new Error(
      `Invalid vout ${vout} for transaction ${txid} (has ${txInfo.vout.length} outputs)`,
    );
  }

  const output = txInfo.vout[vout];
  if (!isValidSatoshiValue(output.value)) {
    throw new Error(`Invalid UTXO value ${output.value} for ${txid}:${vout}`);
  }
  assertValidScriptPubKey(output.scriptpubkey, `${txid}:${vout}`);

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
  assertValidAddress(address);
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

    // Validate and cross-verify each UTXO against its transaction data.
    // The listing endpoint is treated as discovery only — each UTXO is
    // independently verified via /tx/{txid} to confirm value and scriptPubKey.
    const verifiedUtxos: typeof utxos = [];
    for (const utxo of utxos) {
      assertValidTxid(utxo.txid);

      if (!isValidVout(utxo.vout)) {
        throw new Error(`Invalid vout ${utxo.vout} for ${utxo.txid}`);
      }
      if (!isValidSatoshiValue(utxo.value)) {
        throw new Error(
          `Invalid UTXO value ${utxo.value} for ${utxo.txid}:${utxo.vout}`,
        );
      }

      // Cross-verify: fetch the transaction and check the specific output
      const txInfo = await fetchApi<TxInfo>(`${apiUrl}/tx/${utxo.txid}`);

      if (!isValidVout(utxo.vout, txInfo.vout.length)) {
        throw new Error(
          `UTXO vout ${utxo.vout} out of range for tx ${utxo.txid} (${txInfo.vout.length} outputs)`,
        );
      }

      const output = txInfo.vout[utxo.vout];
      if (output.value !== utxo.value) {
        throw new Error(
          `UTXO value mismatch for ${utxo.txid}:${utxo.vout}: ` +
            `listing reports ${utxo.value}, transaction reports ${output.value}`,
        );
      }

      if (output.scriptpubkey !== addressInfo.scriptPubKey) {
        throw new Error(
          `UTXO scriptPubKey mismatch for ${utxo.txid}:${utxo.vout}: ` +
            `output does not pay to the requested address`,
        );
      }

      verifiedUtxos.push(utxo);
    }

    // Sort by value (largest first) and map to our UTXO format
    const sortedUTXOs = verifiedUtxos.sort((a, b) => b.value - a.value);

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

/**
 * Transaction summary from address transactions endpoint.
 */
export interface AddressTx {
  txid: string;
  status: {
    confirmed: boolean;
    block_height?: number;
  };
}

/**
 * Get recent transactions for a Bitcoin address.
 *
 * Returns the last 25 confirmed transactions plus any unconfirmed (mempool) transactions.
 * This is useful for checking if a specific transaction has been broadcast.
 *
 * @param address - The Bitcoin address
 * @param apiUrl - Mempool API base URL
 * @returns Array of recent transactions
 */
export async function getAddressTxs(
  address: string,
  apiUrl: string,
): Promise<AddressTx[]> {
  assertValidAddress(address);
  return fetchApi<AddressTx[]>(`${apiUrl}/address/${address}/txs`);
}

/**
 * Fetches Bitcoin network fee recommendations from mempool.space API.
 *
 * @param apiUrl - Mempool API base URL
 * @returns Fee rates in sat/vbyte for different confirmation times
 * @throws Error if request fails or returns invalid data
 *
 * @see https://mempool.space/docs/api/rest#get-recommended-fees
 */
export async function getNetworkFees(apiUrl: string): Promise<NetworkFees> {
  const response = await fetchWithTimeout(`${apiUrl}/v1/fees/recommended`);

  if (!response.ok) {
    throw new Error(
      `Failed to fetch network fees: ${response.status} ${response.statusText}`,
    );
  }

  const data = await response.json();

  const feeFields = [
    "fastestFee",
    "halfHourFee",
    "hourFee",
    "economyFee",
    "minimumFee",
  ] as const;

  for (const field of feeFields) {
    if (!isValidFeeRate(data[field])) {
      throw new Error(
        `Invalid fee rate ${field}=${data[field]} from mempool API: expected a positive number ≤ ${MAX_FEE_RATE}`,
      );
    }
  }

  if (
    data.minimumFee > data.economyFee ||
    data.economyFee > data.hourFee ||
    data.hourFee > data.halfHourFee ||
    data.halfHourFee > data.fastestFee
  ) {
    throw new Error(
      `Fee rate ordering violation from mempool API: expected ` +
        `minimumFee (${data.minimumFee}) <= economyFee (${data.economyFee}) <= ` +
        `hourFee (${data.hourFee}) <= halfHourFee (${data.halfHourFee}) <= ` +
        `fastestFee (${data.fastestFee}).`,
    );
  }

  return data as NetworkFees;
}

