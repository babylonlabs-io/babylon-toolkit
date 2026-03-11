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
  /** CSV timelock in blocks for the PegIn output */
  timelockPegin: number;
  /** Amount to peg-in in satoshis */
  pegInAmount: bigint;
  /** Amount in satoshis for the depositor's claim output */
  depositorClaimValue: bigint;
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
  /** CSV timelock in blocks for the PegIn output */
  timelockPegin: number;
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

/**
 * Parameters for creating an Assert Payout/NoPayout connector.
 * This connector generates scripts for the depositor's own graph (depositor-as-claimer).
 */
export interface AssertPayoutNoPayoutConnectorParams {
  /** X-only public key of the claimer (depositor acting as claimer, hex encoded) */
  claimer: string;
  /** Array of x-only public keys of local challengers (hex encoded) */
  localChallengers: string[];
  /** Array of x-only public keys of universal challengers (hex encoded) */
  universalChallengers: string[];
  /** CSV timelock in blocks for the Assert output */
  timelockAssert: number;
  /** Array of x-only public keys of security council members (hex encoded) */
  councilMembers: string[];
  /** Council quorum (M-of-N multisig threshold) */
  councilQuorum: number;
}

/**
 * Script info for Assert Payout (depositor graph)
 */
export interface AssertPayoutScriptInfo {
  /** The payout script (hex encoded) */
  payoutScript: string;
  /** The control block for the payout script (hex encoded) */
  payoutControlBlock: string;
}

/**
 * Script info for Assert NoPayout (depositor graph, per challenger)
 */
export interface AssertNoPayoutScriptInfo {
  /** The NoPayout script (hex encoded) */
  noPayoutScript: string;
  /** The control block for the NoPayout script (hex encoded) */
  noPayoutControlBlock: string;
}

/**
 * Parameters for creating a ChallengeAssert connector.
 * This connector generates scripts for the ChallengeAssert transaction.
 */
export interface ChallengeAssertConnectorParams {
  /** X-only public key of the claimer (depositor acting as claimer, hex encoded) */
  claimer: string;
  /** X-only public key of the challenger (hex encoded) */
  challenger: string;
  /** JSON string of Lamport hash values from VP */
  lamportHashesJson: string;
  /** JSON string of GC input label hashes from VP */
  gcInputLabelHashesJson: string;
}

/**
 * Script info for ChallengeAssert
 */
export interface ChallengeAssertScriptInfo {
  /** The ChallengeAssert script (hex encoded) */
  script: string;
  /** The control block for the ChallengeAssert script (hex encoded) */
  controlBlock: string;
}
