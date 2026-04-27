/**
 * Bitcoin network types supported by the vault system
 */
export type Network = "bitcoin" | "testnet" | "regtest" | "signet";

/**
 * Parameters for creating an unfunded Pre-PegIn transaction.
 *
 * The Pre-PegIn transaction locks BTC in HTLC output(s). The depositor must
 * fund it with UTXOs from their wallet. Once funded, call
 * reconstructFromFundedTx() then buildPeginTx() to derive the PegIn transaction.
 */
export interface PrePeginParams {
  /** X-only public key of the depositor (hex encoded, 64 chars) */
  depositorPubkey: string;
  /** X-only public key of the vault provider (hex encoded, 64 chars) */
  vaultProviderPubkey: string;
  /** Array of x-only public keys of vault keepers (hex encoded, 64 chars each) */
  vaultKeeperPubkeys: string[];
  /** Array of x-only public keys of universal challengers (hex encoded, 64 chars each) */
  universalChallengerPubkeys: string[];
  /** SHA256 hash commitments (64 hex chars = 32 bytes each). One per HTLC output. */
  hashlocks: readonly string[];
  /** CSV timelock in blocks for the HTLC refund path */
  timelockRefund: number;
  /** Amounts to peg in per HTLC output (satoshis) */
  pegInAmounts: readonly bigint[];
  /** Fee rate in sat/vB from contract offchain params */
  feeRate: bigint;
  /** Number of local challengers (from contract params) */
  numLocalChallengers: number;
  /** M in M-of-N council multisig (from contract params) */
  councilQuorum: number;
  /** N in M-of-N council multisig (from contract params) */
  councilSize: number;
  /** Bitcoin network */
  network: Network;
  /**
   * Optional 32-byte `SHA256(auth_anchor)` commitment to embed in an
   * `OP_RETURN` output at vout = `hashlocks.length`. Required by the
   * vault provider's bearer-token auth flow to bind a depositor's
   * auth-anchor preimage to a specific Pre-PegIn.
   *
   * Hex-encoded 64 chars, no `0x` prefix. Omit (or pass `undefined`)
   * to produce a Pre-PegIn without the OP_RETURN output.
   */
  authAnchorHash?: string;
}

/**
 * Result of creating an unfunded Pre-PegIn transaction.
 *
 * The transaction has no inputs and one or more HTLC outputs. The caller
 * must fund it by selecting UTXOs covering the sum of htlcValues + fees, then call
 * reconstructFromFundedTx() followed by buildPeginTx() to derive PegIn transactions.
 */
export interface PrePeginResult {
  /** Unfunded transaction hex (no inputs, HTLC outputs only) */
  txHex: string;
  /** Transaction ID of the unfunded Pre-PegIn transaction */
  txid: string;
  /** Per-HTLC output values in satoshis (peginAmount + depositorClaimValue + minPeginFee each) */
  htlcValues: readonly bigint[];
  /** Per-HTLC output scriptPubKeys (hex encoded) */
  htlcScriptPubKeys: readonly string[];
  /** Per-HTLC Taproot addresses */
  htlcAddresses: readonly string[];
  /** Per-HTLC pegin amounts in satoshis */
  peginAmounts: readonly bigint[];
  /** Depositor claim value computed by WASM from contract parameters */
  depositorClaimValue: bigint;
}

/**
 * Result of building the PegIn transaction from a funded Pre-PegIn txid.
 */
export interface PeginTxResult {
  /** PegIn transaction hex (1 input spending HTLC output, 1 vault output) */
  txHex: string;
  /** PegIn transaction ID */
  txid: string;
  /** Vault output scriptPubKey (hex encoded) */
  vaultScriptPubKey: string;
  /** Vault output value in satoshis */
  vaultValue: bigint;
}

/**
 * Parameters for constructing the Pre-PegIn HTLC connector.
 *
 * Subset of PrePeginParams — only the structural parameters, not the fee/amount ones.
 */
export interface HtlcConnectorParams {
  /** X-only public key of the depositor (hex encoded, 64 chars) */
  depositorPubkey: string;
  /** X-only public key of the vault provider (hex encoded, 64 chars) */
  vaultProviderPubkey: string;
  /** Array of x-only public keys of vault keepers (hex encoded, 64 chars each) */
  vaultKeeperPubkeys: string[];
  /** Array of x-only public keys of universal challengers (hex encoded, 64 chars each) */
  universalChallengerPubkeys: string[];
  /** SHA256 hash commitment for a single HTLC (64 hex chars = 32 bytes) */
  hashlock: string;
  /** CSV timelock in blocks for the HTLC refund path */
  timelockRefund: number;
  /** Bitcoin network */
  network: Network;
}

/**
 * HTLC connector info for building PSBTs that sign Pre-PegIn HTLC inputs.
 */
export interface HtlcConnectorInfo {
  /** Hashlock + all-party spend script (leaf 0) as hex — used for PegIn tx signing */
  hashlockScript: string;
  /** Taproot control block for the hashlock leaf (leaf 0) */
  hashlockControlBlock: string;
  /** Refund script (leaf 1) as hex */
  refundScript: string;
  /** Taproot control block for the refund leaf (leaf 1) */
  refundControlBlock: string;
  /** HTLC Taproot address */
  address: string;
  /** HTLC scriptPubKey (hex encoded) */
  scriptPubKey: string;
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
  /** Serialized control block for Taproot script path spend (hex encoded) */
  payoutControlBlock: string;
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
  /** JSON string of WOTS public keys (blocks 0-1) from VP */
  claimerWotsKeysJson: string;
  /** JSON string of GC WOTS public keys (array of arrays) from VP */
  gcWotsKeysJson: string;
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
