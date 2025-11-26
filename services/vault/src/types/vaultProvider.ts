/**
 * Provider domain types
 *
 * Represents vault providers and liquidators in the system.
 */

/**
 * Liquidator (challenger) information
 */
export interface Liquidator {
  /** Liquidator's Ethereum address */
  id: string;
  /** Liquidator's BTC public key (x-only, 32 bytes hex with 0x prefix) */
  btcPubKey: string;
}

/**
 * Vault provider information
 */
export interface VaultProvider {
  /** Provider's Ethereum address */
  id: string;
  /** Provider's BTC public key (hex with 0x prefix) */
  btcPubKey: string;
  /** Provider status: "pending" | "active" */
  status: string;
  /** Provider's RPC URL (from registry) */
  url: string;
}

/**
 * Response from fetchProviders containing vault providers and liquidators
 */
export interface ProvidersResponse {
  /** Vault providers for the application */
  vaultProviders: VaultProvider[];
  /** Liquidators (challengers) for the application */
  liquidators: Liquidator[];
}
