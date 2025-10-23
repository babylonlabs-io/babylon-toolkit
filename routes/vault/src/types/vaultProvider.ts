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
 * Vault provider information
 */
export interface VaultProvider {
  /** Provider's Ethereum address */
  id: string;
  /** Provider's BTC public key */
  btc_pub_key: string;
  /** Provider's RPC URL */
  url: string;
  /** Liquidators (challengers) for this provider */
  liquidators: Liquidator[];
}
