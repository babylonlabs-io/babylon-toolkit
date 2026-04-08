/**
 * Collateral vault entry for display in the dashboard.
 * Represents a single peg-in vault used as Aave collateral.
 */
export interface CollateralVaultEntry {
  /** Composite ID for React keys */
  id: string;
  /** Derived vault ID: keccak256(abi.encode(peginTxHash, depositor)) */
  vaultId: string;
  /** Raw BTC pegin transaction hash (for VP RPC operations like artifact download) */
  peginTxHash?: string;
  /** Vault amount in BTC (converted from satoshis) */
  amountBtc: number;
  /** Unix timestamp in seconds when added as collateral */
  addedAt: number;
  /** Whether the vault is currently in use as collateral */
  inUse: boolean;
  /** Vault provider Ethereum address */
  providerAddress: string;
  /** Vault provider display name */
  providerName: string;
  /** Vault provider icon URL (optional) */
  providerIconUrl?: string;
  /** Depositor's BTC public key (hex) */
  depositorBtcPubkey?: string;
  /** Liquidation priority index (0 = seized first) */
  liquidationIndex: number;
}
