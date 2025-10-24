/**
 * Configuration for vault provider RPC client
 */

/** Default timeout for RPC requests (30 seconds) */
export const RPC_TIMEOUT = 30000;

/** Default RPC service URL */
const DEFAULT_RPC_URL = 'http://localhost:8080';

/**
 * Get the vault provider RPC service URL from environment variables
 * Default: http://localhost:8080
 */
export function getVaultProviderRpcUrl(): string {
  return process.env.NEXT_PUBLIC_VAULT_PROVIDER_RPC_URL || DEFAULT_RPC_URL;
}
