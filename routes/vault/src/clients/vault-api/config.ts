/**
 * Configuration for Vault Indexer API client
 *
 * Uses centralized environment variable validation from config/env.ts
 */

import { ENV } from '../../config/env';

/**
 * Get the Vault API base URL from environment variables
 */
export function getVaultApiUrl(): string {
  return ENV.VAULT_API_URL;
}

/**
 * Default timeout for API requests (30 seconds)
 */
export const DEFAULT_TIMEOUT = 30000;
