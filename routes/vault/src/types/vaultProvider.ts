/**
 * Vault Provider domain types
 *
 * Represents vault providers in the system - entities that provide
 * vault services including BTC custody and transaction signing.
 */

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
}
