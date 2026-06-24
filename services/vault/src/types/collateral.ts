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
  /**
   * Pre-PegIn transaction hash (txid of `unsignedPrePeginTx`). Derived for the
   * collateral card's TX Hash row. Optional because legacy / edge-case data may
   * lack a decodable pre-pegin tx.
   */
  prePeginTxHash?: string;
  /** Vault amount in BTC (converted from satoshis) */
  amountBtc: number;
  /** Unix timestamp in seconds when added as collateral */
  addedAt: number;
  /** Whether the vault is currently in use as collateral */
  inUse: boolean;
  /**
   * True for an optimistic row shown right after the activation ETH tx, while
   * the Aave indexer has not yet ingested the vault as collateral. Such a row
   * has no indexed metadata (provider/tx hashes/liquidation order may be
   * placeholders) and is not selectable/withdrawable. Cleared once the indexer
   * reflects the vault. See ActivatingVaultsContext.
   */
  isActivating?: boolean;
  /** Vault provider Ethereum address */
  providerAddress: string;
  /** Vault provider display name */
  providerName: string;
  /** Vault provider icon URL (optional) */
  providerIconUrl?: string;
  /** Depositor's BTC public key (hex) */
  depositorBtcPubkey?: string;
  /**
   * On-chain registered payout scriptPubKey (0x-prefixed hex). Where BTC is
   * sent on withdraw. Decoded for display via `scriptPubKeyHexToBtcAddress`.
   */
  depositorPayoutBtcAddress?: string;
  /**
   * Unsigned pre-pegin BTC transaction hex (from the indexer). Needed by
   * the collateral artifact re-download path to re-derive the VP auth
   * anchor when the in-memory token registry is cold. Optional because
   * legacy / edge-case data may lack it.
   */
  unsignedPrePeginTx?: string;
  /** Liquidation priority index (0 = seized first) */
  liquidationIndex: number;
  /** Resolves the vault's peg-out `timelockAssert` for the withdrawal ETA.
   *  Optional only because the `vault` relation is (like the fields above). */
  offchainParamsVersion?: number;
}
