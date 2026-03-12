/**
 * Collateral vault entry for display in the dashboard.
 * Represents a single peg-in vault used as Aave collateral.
 */
export interface CollateralVaultEntry {
  /** Composite ID for React keys */
  id: string;
  /** Peg-in transaction hash (pegInTxHash) used as vault ID (for display and operations) */
  vaultId: string;
  /** Vault amount in BTC (converted from satoshis) */
  amountBtc: number;
  /** Unix timestamp in seconds when added as collateral */
  addedAt: number;
  /** Whether the vault is currently in use as collateral */
  inUse: boolean;
  /** Vault provider display name */
  providerName: string;
  /** Vault provider icon URL (optional) */
  providerIconUrl?: string;
  /** Whether the vault provider is verified */
  providerVerified?: boolean;
}
