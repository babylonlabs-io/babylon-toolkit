/**
 * Mempool API Client for Bitcoin Network
 *
 * Simple client for fetching UTXOs from mempool.space API.
 */

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
 * Get mempool API URL based on network
 */
function getMempoolApiUrl(): string {
  // Use signet for vault development
  const baseUrl =
    process.env.NEXT_PUBLIC_MEMPOOL_API || 'https://mempool.space';

  // Always use signet for now
  return `${baseUrl}/signet/api`;
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

    const contentType = response.headers.get('content-type');
    if (contentType?.includes('application/json')) {
      return (await response.json()) as T;
    } else {
      return (await response.text()) as T;
    }
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Failed to fetch from mempool API: ${error.message}`);
    }
    throw new Error('Failed to fetch from mempool API: Unknown error');
  }
}

/**
 * Transaction info from mempool API
 */
export interface TxInfo {
  vout: Array<{
    scriptpubkey: string;
    value: number;
  }>;
}

/**
 * Get transaction information from mempool API
 * 
 * @param txid - Transaction ID
 * @returns Promise resolving to transaction info with outputs
 */
export async function getTxInfo(txid: string): Promise<TxInfo> {
  const apiUrl = getMempoolApiUrl();
  return fetchApi<TxInfo>(`${apiUrl}/tx/${txid}`);
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
 * Broadcast a signed Bitcoin transaction to the network
 * 
 * @param txHex - Signed transaction hex
 * @returns Transaction ID
 */
export async function pushTx(txHex: string): Promise<string> {
  const apiUrl = getMempoolApiUrl();
  
  try {
    const txId = await fetchApi<string>(`${apiUrl}/tx`, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain',
      },
      body: txHex,
    });
    
    return txId;
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Failed to broadcast transaction: ${error.message}`);
    }
    throw new Error('Failed to broadcast transaction: Unknown error');
  }
}

