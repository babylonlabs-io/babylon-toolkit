/**
 * Vault Provider domain types
 *
 * Represents vault providers in the system - entities that provide
 * vault services including BTC custody and transaction signing.
 */

/**
 * Liquidator (challenger) information
 */
export interface Liquidator {
  /** Liquidator's Ethereum address */
  address: string;
  /** Liquidator's BTC public key (x-only, 32 bytes hex with 0x prefix) */
  btc_pub_key: string;
}

/**
 * Vault provider information from GraphQL indexer
 */
export interface VaultProviderIndexed {
  /** Provider's Ethereum address */
  id: string;
  /** Provider's BTC public key */
  btc_pub_key: string;
  /** Application controller address */
  application_controller: string;
  /** Registration deposit amount in wei */
  deposit_amount: string;
  /** Provider status (pending, active, etc.) */
  status: string;
  /** Timestamp when provider was registered */
  registered_at: string;
  /** Timestamp when provider was activated */
  activated_at: string | null;
  /** Block number of registration */
  block_number: string;
  /** Transaction hash of registration */
  transaction_hash: string;
}

/**
 * Full vault provider information (may include data from multiple sources)
 */
export interface VaultProvider extends VaultProviderIndexed {
  /** Provider's RPC URL (from REST API or config, not in GraphQL indexer) */
  url?: string;
  /** Liquidators (challengers) for this provider (from REST API or separate query) */
  liquidators?: Liquidator[];
}
