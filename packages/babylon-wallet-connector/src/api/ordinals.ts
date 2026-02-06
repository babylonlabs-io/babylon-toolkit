/**
 * Ordinals API Client
 *
 * API client for verifying whether UTXOs contain inscriptions (ordinals, BRC-20, runes, etc.).
 * Falls back to backend verification when wallet doesn't support getInscriptions().
 */

import type { InscriptionIdentifier, UTXO } from "@/core/types";

/** Response from the ordinals verification API */
export interface UtxoOrdinalInfo {
  txid: string;
  vout: number;
  inscription: boolean;
}

interface VerifyUtxosResponse {
  data: UtxoOrdinalInfo[];
}

/**
 * Default timeout per batch request in milliseconds.
 * Each batch contains up to BATCH_SIZE UTXOs. Batches run in parallel,
 * so total time is roughly max(batch1, batch2, ...) not sum of all.
 */
const DEFAULT_TIMEOUT = 2000;

/** Maximum UTXOs per batch request */
const BATCH_SIZE = 30;

/**
 * Split an array into chunks of a specified size.
 */
function chunkArray<T>(array: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}

/**
 * Verify UTXOs for ordinal inscriptions via backend API.
 *
 * This is used as a fallback when the wallet doesn't support getInscriptions().
 * The API endpoint should be provided by the consuming application.
 *
 * @param utxos - UTXOs to verify
 * @param address - Bitcoin address owning the UTXOs
 * @param apiBaseUrl - Base URL for the ordinals API (e.g., "https://api.example.com")
 * @param timeout - Request timeout in milliseconds (default: 2000)
 * @returns Array of UTXO info with inscription status
 * @throws Error if API request fails
 */
export async function verifyUtxoOrdinals(
  utxos: UTXO[],
  address: string,
  apiBaseUrl: string,
  timeout = DEFAULT_TIMEOUT,
): Promise<UtxoOrdinalInfo[]> {
  if (utxos.length === 0) {
    return [];
  }

  const utxoChunks = chunkArray(utxos, BATCH_SIZE);

  const responses = await Promise.all(
    utxoChunks.map(async (chunk) => {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);

      try {
        const response = await fetch(`${apiBaseUrl}/v1/ordinals/verify-utxos`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            address,
            utxos: chunk.map((utxo) => ({
              txid: utxo.txid,
              vout: utxo.vout,
            })),
          }),
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error(`API error: ${response.status} ${response.statusText}`);
        }

        const data: VerifyUtxosResponse = await response.json();
        return data.data;
      } finally {
        clearTimeout(timeoutId);
      }
    }),
  );

  return responses.flat();
}

/**
 * Convert UTXO ordinal info to inscription identifiers.
 *
 * Filters the API response to only include UTXOs that have inscriptions.
 *
 * @param utxoInfos - Array of UTXO ordinal info from API
 * @returns Array of inscription identifiers
 */
export function toInscriptionIdentifiers(
  utxoInfos: UtxoOrdinalInfo[],
): InscriptionIdentifier[] {
  return utxoInfos
    .filter((info) => info.inscription)
    .map((info) => ({
      txid: info.txid,
      vout: info.vout,
    }));
}
