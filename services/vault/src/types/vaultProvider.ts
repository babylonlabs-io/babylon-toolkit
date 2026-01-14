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
  /** Provider's RPC URL (from registry) */
  url: string;
}

/**
 * Response from fetchProviders containing vault providers, vault keepers, and universal challengers
 */
export interface ProvidersResponse {
  /** Vault providers for the application */
  vaultProviders: VaultProvider[];
  /** Vault keepers for the application (per-application) */
  vaultKeepers: VaultKeeper[];
  /** Universal challengers (system-wide) */
  universalChallengers: UniversalChallenger[];
}
