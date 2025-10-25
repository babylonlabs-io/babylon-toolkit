/**
 * Type definitions for Vault Indexer API
 *
 * Source: vault-indexer swagger docs
 * API Version: 1.0
 * Last synced: 2025-10-16
 */

// ============================================================================
// Vault Types
// ============================================================================

/**
 * Vault information from the indexer
 * Corresponds to: model.Vault (swagger.yaml)
 */
export interface Vault {
  /** Vault ID (pegin transaction hash) */
  id: string;
  /** Depositor's Ethereum address */
  depositor: string;
  /** Proxy contract address */
  proxy_contract: string;
  /** Market ID for the Morpho market */
  market_id: string;
  /** Amount of vBTC minted (as string to preserve precision) */
  vbtc_amount: string;
  /** Amount borrowed from Morpho (as string to preserve precision) */
  borrow_amount: string;
}

// ============================================================================
// Vault Provider Types
// ============================================================================

/**
 * Vault provider information
 * Corresponds to: model.VaultProvider (swagger.yaml)
 *
 * Re-exported from types/ directory (domain model)
 */
export type { VaultProvider } from '../../types/vaultProvider';

// ============================================================================
// Morpho Market Types
// ============================================================================

/**
 * Asset information (collateral or loan)
 * Corresponds to: morpho.Asset (swagger.yaml)
 */
export interface MorphoAsset {
  /** Asset contract address */
  address: string;
  /** Asset symbol (e.g., "vBTC", "USDC") */
  symbol: string;
}

/**
 * Morpho market information
 * NOTE: Actual API response differs from swagger.yaml
 * Real API uses snake_case and includes market id
 */
export interface MorphoMarket {
  /** Market ID (hex string without 0x prefix) */
  id: string;
  /** Loan token address */
  loan_token: string;
  /** Collateral token address */
  collateral_token: string;
  /** Oracle address for price feeds */
  oracle: string;
  /** Interest rate model address */
  irm: string;
  /** Loan-to-value ratio (as string with 18 decimals, e.g. "860000000000000000") */
  lltv: string;
  /** Block number when market was created */
  created_block: number;
  /** Transaction hash when market was created */
  created_tx_hash: string;
}
