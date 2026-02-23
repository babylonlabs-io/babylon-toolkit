/**
 * Collateral vault entry for display in the dashboard.
 * Represents a single peg-in vault used as Aave collateral.
 */
export interface CollateralVaultEntry {
  /** Composite ID for React keys */
  id: string;
  /** Peg-in tx hash (for display and operations) */
  vaultId: string;
  /** Vault amount in BTC (converted from satoshis) */
  amountBtc: number;
  /** Unix timestamp in seconds when added as collateral */
  addedAt: number;
}
