/**
 * Vault Indexer API Client
 * 
 * Handles communication with the vault-indexer backend service
 */

const API_BASE_URL = process.env.NEXT_PUBLIC_VAULT_API_URL || 'http://localhost:8080';

export interface VaultProvider {
  id: string; // Provider's ETH address (same as contract address)
  btc_pub_key: string;
  url: string;
  liquidators: string[]; // Array of liquidator BTC public keys
}


class VaultIndexerAPIError extends Error {
  constructor(
    message: string,
    public status?: number,
    public statusText?: string,
  ) {
    super(message);
    this.name = 'VaultIndexerAPIError';
  }
}

/**
 * Fetch wrapper with error handling
 */
async function fetchApi<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const url = `${API_BASE_URL}${endpoint}`;
  
  try {
    const response = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options?.headers,
      },
    });

    if (!response.ok) {
      throw new VaultIndexerAPIError(
        `API request failed: ${response.statusText}`,
        response.status,
        response.statusText,
      );
    }

    return await response.json();
  } catch (error) {
    if (error instanceof VaultIndexerAPIError) {
      throw error;
    }
    throw new VaultIndexerAPIError(
      `Network error: ${error instanceof Error ? error.message : 'Unknown error'}`,
    );
  }
}

/**
 * Get all active vault providers
 */
export async function getVaultProviders(): Promise<VaultProvider[]> {
  return fetchApi<VaultProvider[]>('/v1/providers');
}

export const vaultIndexerAPI = {
  getVaultProviders,
};

