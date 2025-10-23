/**
 * Bitcoin network types supported by the vault system
 */
export type Network = "bitcoin" | "testnet" | "regtest" | "signet";

/**
 * Parameters for creating a peg-in transaction
 */
export interface PegInParams {
  /** Transaction ID of the deposit transaction */
  depositTxid: string;
  /** Output index (vout) of the deposit transaction */
  depositVout: number;
  /** Value of the deposit output in satoshis */
  depositValue: bigint;
  /** Script pubkey of the deposit output (hex encoded) */
  depositScriptPubKey: string;
  /** X-only public key of the depositor (hex encoded) */
  depositorPubkey: string;
  /** X-only public key of the claimer/vault provider (hex encoded) */
  claimerPubkey: string;
  /** Array of x-only public keys of challengers (hex encoded) */
  challengerPubkeys: string[];
  /** Amount to peg-in in satoshis */
  pegInAmount: bigint;
  /** Transaction fee in satoshis */
  fee: bigint;
  /** Bitcoin network */
  network: Network;
}

/**
 * Result of creating a peg-in transaction
 */
export interface PegInResult {
  /** Transaction hex */
  txHex: string;
  /** Transaction ID */
  txid: string;
  /** Vault script pubkey (hex encoded) */
  vaultScriptPubKey: string;
  /** Vault output value in satoshis */
  vaultValue: bigint;
  /** Change output value in satoshis (0 if no change) */
  changeValue: bigint;
}

/**
 * Parameters for creating a payout connector
 */
export interface PayoutConnectorParams {
  /** X-only public key of the depositor (hex encoded) */
  depositor: string;
  /** X-only public key of the vault provider (hex encoded) */
  vaultProvider: string;
  /** Array of x-only public keys of liquidators (hex encoded) */
  liquidators: string[];
}

/**
 * Information about a payout connector
 */
export interface PayoutConnectorInfo {
  /** The full payout script (hex encoded) */
  payoutScript: string;
  /** Taproot script hash (TapNodeHash) - this is the tapLeafHash needed for signing PSBTs */
  taprootScriptHash: string;
  /** Taproot script pubkey (hex encoded) */
  scriptPubKey: string;
  /** Pay-to-Taproot (P2TR) address */
  address: string;
}
