/**
 * Configuration for vault provider RPC client
 *
 * Uses centralized environment variable validation from config/env.ts
 */

import { ENV, ENV_DEFAULTS } from '../../config/env';

/** Default timeout for RPC requests (30 seconds) */
export const RPC_TIMEOUT = 30000;

/**
 * Get the vault provider RPC service URL from environment variables
 * Default: http://localhost:8080
 */
export function getVaultProviderRpcUrl(): string {
  return ENV.VAULT_PROVIDER_RPC_URL || ENV_DEFAULTS.VAULT_PROVIDER_RPC_URL;
}
