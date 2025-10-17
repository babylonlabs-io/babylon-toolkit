/**
 * Configuration for Vault Indexer API client
 */

/**
 * Get the Vault API base URL from environment variables
 */
export function getVaultApiUrl(): string {
  const url = process.env.NEXT_PUBLIC_VAULT_API_URL;

  if (!url) {
    throw new Error(
      'NEXT_PUBLIC_VAULT_API_URL environment variable is not set. ' +
      'Please configure the vault indexer API URL in your .env file.'
    );
  }

  return url;
}

/**
 * Default timeout for API requests (30 seconds)
 */
export const DEFAULT_TIMEOUT = 30000;
