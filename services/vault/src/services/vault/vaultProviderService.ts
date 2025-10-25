/**
 * Vault Provider Service
 *
 * Handles fetching and managing vault provider data from the vault-indexer API.
 */

import { VaultApiClient } from '../../clients/vault-api';
import { getVaultApiUrl, DEFAULT_TIMEOUT } from '../../clients/vault-api/config';
import type { VaultProvider } from '../../types/vaultProvider';

/**
 * Fetch all vault providers from the vault-indexer API
 *
 * @returns Array of vault providers
 * @throws Error if API request fails
 */
export async function getVaultProviders(): Promise<VaultProvider[]> {
  const client = new VaultApiClient(getVaultApiUrl(), DEFAULT_TIMEOUT);
  const providers = await client.getProviders();

  // Return providers directly - API response already matches VaultProvider type
  return providers;
}
