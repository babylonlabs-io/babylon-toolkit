/**
 * Vault Indexer API Client
 *
 * REST API client for querying vault and market information from the Babylon vault indexer.
 *
 * @example
 * ```typescript
 * import { VaultApiClient, getVaultApiUrl, DEFAULT_TIMEOUT } from '@/clients/vault-api';
 *
 * const client = new VaultApiClient(getVaultApiUrl());
 *
 * // Get all markets
 * const markets = await client.getMarkets();
 *
 * // Get all providers
 * const providers = await client.getProviders();
 *
 * // Get specific vault
 * const vault = await client.getVault('0xabc123...');
 * ```
 */

export { VaultApiClient } from './api';
export {
  getVaultApiUrl,
  DEFAULT_TIMEOUT,
} from './config';
export type {
  Vault,
  VaultProvider,
  MorphoMarket,
  MorphoAsset,
} from './types';
