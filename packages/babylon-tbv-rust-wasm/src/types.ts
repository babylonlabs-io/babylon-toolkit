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

// ============================================================================
// Pre-PegIn Types (New PegIn Flow)
// ============================================================================

/**
 * Parameters for creating a Pre-PegIn HTLC connector.
 *
 * The HTLC connector defines the spending conditions for the Pre-PegIn output:
 * - Leaf 0 (hashlock): Secret reveal + all-party signatures (Depositor + VP + VKs + UCs)
 * - Leaf 1 (refund): Depositor signature after CSV timelock
 */
export interface PrePeginHtlcConnectorParams {
  /** X-only public key of the depositor (hex encoded, 64 chars) */
  depositor: string;
  /** X-only public key of the vault provider (hex encoded, 64 chars) */
  vaultProvider: string;
  /** Array of x-only public keys of vault keepers (hex encoded) */
  vaultKeepers: string[];
  /** Array of x-only public keys of universal challengers (hex encoded) */
  universalChallengers: string[];
  /** SHA256 hash commitment h = SHA256(s) (hex encoded, 64 chars = 32 bytes) */
  hashH: string;
  /** CSV timelock for the refund path in blocks (must be non-zero) */
  timelockRefund: number;
}

/**
 * HTLC connector information for the Pre-PegIn output.
 */
export interface PrePeginHtlcConnectorInfo {
  /** Taproot address for the HTLC output */
  address: string;
  /** Taproot scriptPubKey (hex encoded) */
  scriptPubKey: string;
  /** Hashlock + all-party spend script (leaf 0, hex encoded) */
  hashlockScript: string;
  /** Control block for spending via the hashlock leaf (hex encoded) */
  hashlockControlBlock: string;
  /** Refund script (leaf 1, hex encoded) */
  refundScript: string;
  /** Control block for spending via the refund leaf (hex encoded) */
  refundControlBlock: string;
}

/**
 * Parameters for creating an unfunded Pre-PegIn transaction.
 *
 * The Pre-PegIn transaction locks BTC in an HTLC output that can be spent
 * either by revealing the secret (hashlock path) or by the depositor after
 * the refund timelock expires.
 *
 * The `depositorClaimValue` and `htlcValue` are auto-computed by WASM from
 * the provided contract parameters.
 */
export interface PrePeginTxParams {
  /** X-only public key of the depositor (hex encoded, 64 chars) */
  depositor: string;
  /** X-only public key of the vault provider (hex encoded, 64 chars) */
  vaultProvider: string;
  /** Array of x-only public keys of vault keepers (hex encoded) */
  vaultKeepers: string[];
  /** Array of x-only public keys of universal challengers (hex encoded) */
  universalChallengers: string[];
  /** SHA256 hash commitment h = SHA256(s) (hex encoded, 64 chars = 32 bytes) */
  hashH: string;
  /** CSV timelock for the refund path in blocks (must be non-zero) */
  timelockRefund: number;
  /** Amount in satoshis to lock in the vault */
  peginAmount: bigint;
  /** Fee rate in sat/vB (from contract offchain params) */
  feeRate: bigint;
  /** Number of local challengers (from contract params) */
  numLocalChallengers: number;
  /** M in M-of-N council multisig (from contract params) */
  councilQuorum: number;
  /** N in M-of-N council multisig (from contract params) */
  councilSize: number;
  /** Bitcoin network */
  network: Network;
}

/**
 * Result of creating an unfunded Pre-PegIn transaction.
 *
 * This transaction has no inputs and two outputs:
 * - Output 0: HTLC output (value = peginAmount + depositorClaimValue + peginFee)
 * - Output 1: CPFP anchor (BIP-86 keypath for depositor)
 *
 * The frontend must fund this by selecting UTXOs, adding inputs, and a change output.
 */
export interface PrePeginTxResult {
  /** Unfunded transaction hex (no inputs) */
  txHex: string;
  /** Transaction ID (changes after funding) */
  txid: string;
  /** HTLC output scriptPubKey (hex encoded) */
  htlcScriptPubKey: string;
  /** HTLC output value in satoshis (peginAmount + depositorClaimValue + peginFee) */
  htlcValue: bigint;
  /** Taproot address for the HTLC output */
  htlcAddress: string;
  /** Vault amount in satoshis */
  peginAmount: bigint;
  /** Auto-computed depositor claim value in satoshis */
  depositorClaimValue: bigint;
}

/**
 * Parameters for building a PegIn transaction from a funded Pre-PegIn.
 */
export interface PeginFromPrePeginParams {
  /** CSV timelock in blocks for the PegIn output */
  timelockPegin: number;
  /** Txid of the funded (but not yet signed) Pre-PegIn transaction (hex, 64 chars) */
  fundedPrePeginTxid: string;
}

/**
 * Result of building a PegIn transaction from a Pre-PegIn.
 *
 * The PegIn tx has a single input spending Pre-PegIn output 0 (HTLC)
 * via the hashlock + all-party script. The fee is baked into the
 * HTLC input/output difference.
 */
export interface PeginFromPrePeginResult {
  /** Transaction hex */
  txHex: string;
  /** Transaction ID */
  txid: string;
  /** Vault script pubkey (hex encoded) */
  vaultScriptPubKey: string;
  /** Vault output value in satoshis */
  vaultValue: bigint;
}

/**
 * Parameters for building a refund transaction from a funded Pre-PegIn.
 */
export interface RefundFromPrePeginParams {
  /** Transaction fee in satoshis */
  refundFee: bigint;
  /** Txid of the funded Pre-PegIn transaction (hex, 64 chars) */
  fundedPrePeginTxid: string;
}
