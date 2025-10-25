/**
 * Configuration for Bitcoin/Mempool API client
 *
 * Uses centralized environment variable validation from config/env.ts
 */

import { ENV } from '../../config/env';

/**
 * Get the Mempool API base URL from environment variables
 *
 * This is required for fetching UTXOs, broadcasting transactions, and other Bitcoin operations.
 */
export function getMempoolApiUrl(): string {
  // HARDCODED: Using `signet` for vault development
  // TODO: Use wallet's actual network or add separate env var in production
  return `${ENV.MEMPOOL_API}/signet/api`;
}

/**
 * Default timeout for Mempool API requests (30 seconds)
 */
export const MEMPOOL_API_TIMEOUT = 30000;
