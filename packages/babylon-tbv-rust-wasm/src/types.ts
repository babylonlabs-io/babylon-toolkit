/**
 * Bitcoin network types supported by the vault system
 */
export type Network = "bitcoin" | "testnet" | "regtest" | "signet";

/**
 * Parameters for creating an unfunded peg-in transaction.
 *
 * Note: This creates a transaction with no inputs and one output (the pegin output).
 * The frontend is responsible for:
 * - Selecting UTXOs to fund the transaction
 * - Calculating transaction fees
 * - Adding inputs to cover peginAmount + fees
 * - Adding a change output if needed
 * - Creating and signing the PSBT via wallet
 */
export interface PegInParams {
  /** X-only public key of the depositor (hex encoded) */
  depositorPubkey: string;
  /** X-only public key of the vault provider (hex encoded) */
  vaultProviderPubkey: string;
  /** Array of x-only public keys of vault keepers (hex encoded) */
  vaultKeeperPubkeys: string[];
  /** Array of x-only public keys of universal challengers (hex encoded) */
  universalChallengerPubkeys: string[];
  /** Amount to peg-in in satoshis */
  pegInAmount: bigint;
  /** Bitcoin network */
  network: Network;
}

/**
 * Result of creating an unfunded peg-in transaction.
 *
 * This transaction has no inputs and only one output (the pegin output).
 * The frontend must:
 * - Add inputs from selected UTXOs
 * - Calculate and add change output if needed
 * - Sign the transaction via wallet
 */
export interface PegInResult {
  /** Unfunded transaction hex (no inputs, only pegin output) */
  txHex: string;
  /** Transaction ID (will change after adding inputs and signing) */
  txid: string;
  /** Vault script pubkey (hex encoded) */
  vaultScriptPubKey: string;
  /** Vault output value in satoshis */
  vaultValue: bigint;
}

/**
 * Parameters for creating a payout connector
 */
export interface PayoutConnectorParams {
  /** X-only public key of the depositor (hex encoded) */
  depositor: string;
  /** X-only public key of the vault provider (hex encoded) */
  vaultProvider: string;
  /** Array of x-only public keys of vault keepers (hex encoded) */
  vaultKeepers: string[];
  /** Array of x-only public keys of universal challengers (hex encoded) */
  universalChallengers: string[];
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
