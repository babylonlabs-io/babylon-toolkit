/**
 * Vault Indexer API Client
 *
 * REST API client for querying vault and market information from the Babylon vault indexer.
 */

import { VaultApiClient } from "./api";
import { DEFAULT_TIMEOUT, getVaultApiUrl } from "./config";

export { VaultApiClient } from "./api";
export { DEFAULT_TIMEOUT, getVaultApiUrl } from "./config";
export type { MorphoAsset, MorphoMarket, Vault } from "./types";

// Create singleton instance
export const vaultApiClient = new VaultApiClient(
  getVaultApiUrl(),
  DEFAULT_TIMEOUT,
);
