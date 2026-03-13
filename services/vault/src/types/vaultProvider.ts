/**
 * Provider domain types
 *
 * Represents vault providers, vault keepers, and universal challengers in the system.
 */

/**
 * Vault keeper information (per-application)
 */
export interface VaultKeeper {
  /** Vault keeper's Ethereum address */
  id: string;
  /** Vault keeper's BTC public key (x-only, 32 bytes hex with 0x prefix) */
  btcPubKey: string;
}

/**
 * Raw vault keeper item from GraphQL, includes version info.
 * Callers decide how to filter by version.
 */
export interface VaultKeeperItem {
  /** Vault keeper's Ethereum address */
  id: string;
  /** Vault keeper's BTC public key (x-only, 32 bytes hex with 0x prefix) */
  btcPubKey: string;
  /** Keeper application version */
  version: number;
}

/**
 * Universal challenger information (system-wide)
 */
export interface UniversalChallenger {
  /** Universal challenger's Ethereum address */
  id: string;
  /** Universal challenger's BTC public key (x-only, 32 bytes hex with 0x prefix) */
  btcPubKey: string;
}

/**
 * Vault provider information
 *
 * Note: Providers are immediately active upon registration (no pending state).
 */
export interface VaultProvider {
  /** Provider's Ethereum address */
  id: string;
  /** Provider's BTC public key (hex with 0x prefix) */
  btcPubKey: string;
  /** Provider's display name (from registry, optional) */
  name?: string;
  /** Provider's RPC URL (from registry) */
  url: string;
  /** Provider's icon URL (from icon service, optional) */
  iconUrl?: string;
}

/**
 * Response from fetchAppProviders containing per-application data only.
 * Includes pre-computed latest-version keepers for the common case,
 * plus raw items with version info for callers that need historical data.
 */
export interface AppProvidersResponse {
  /** Vault providers for the application */
  vaultProviders: VaultProvider[];
  /** Vault keepers filtered to the latest version (most common use case) */
  vaultKeepers: VaultKeeper[];
  /** Raw vault keeper items with version info, if needed */
  vaultKeeperItems?: VaultKeeperItem[];
}
