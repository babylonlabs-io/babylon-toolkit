/**
 * Type definitions for vault provider RPC API
 *
 * Source: https://github.com/babylonlabs-io/btc-vault/blob/main/crates/vaultd-new/src/rpc/server/vault_provider.rs
 */

// ============================================================================
// Request Parameter Types
// ============================================================================

/**
 * Parameters for requesting depositor presign transactions
 * Corresponds to: RequestDepositorPresignTransactionsParams
 */
export interface RequestDepositorPresignTransactionsParams {
  /** The PegIn transaction ID (hex encoded txid) */
  pegin_txid: string;
  /** Hex encoded 32-byte x-only BTC public key of the depositor (no prefix) */
  depositor_pk: string;
}

/**
 * Depositor's signatures for a single claimer's transactions
 * Contains signatures for both PayoutOptimistic and Payout transactions
 */
export interface ClaimerSignatures {
  /** Signature for PayoutOptimistic transaction (64-byte Schnorr, 128 hex chars) */
  payout_optimistic_signature: string;
  /** Signature for Payout transaction (64-byte Schnorr, 128 hex chars) */
  payout_signature: string;
}

/**
 * Parameters for submitting payout signatures
 * Corresponds to: SubmitPayoutSignaturesParams
 */
export interface SubmitPayoutSignaturesParams {
  /** The PegIn transaction ID (hex encoded txid) */
  pegin_txid: string;
  /** Depositor's 32-byte x-only BTC public key (hex encoded, no prefix) */
  depositor_pk: string;
  /**
   * Map of claimer public key to depositor's signatures
   * - Key: Claimer 32-byte x-only public key (hex encoded, no prefix)
   * - Value: ClaimerSignatures containing both PayoutOptimistic and Payout signatures
   */
  signatures: Record<string, ClaimerSignatures>;
}

/**
 * Parameters for getting PegIn status
 * Corresponds to: GetPeginStatusParams
 */
export interface GetPeginStatusParams {
  /** The PegIn transaction ID (hex encoded txid) */
  pegin_txid: string;
}

// ============================================================================
// Response Types
// ============================================================================

/**
 * Transaction data in the response
 * Corresponds to: TransactionData
 */
export interface TransactionData {
  /** Transaction hex */
  tx_hex: string;
  /**
   * Sighash that the depositor should sign (hex encoded 32 bytes)
   * Provided for PayoutOptimistic and Payout transactions
   */
  sighash: string | null;
}

/**
 * Single claimer's transactions for depositor to sign
 * Corresponds to: ClaimerTransactions
 *
 * The depositor needs to sign both:
 * - PayoutOptimistic (optimistic path after Claim, if no challenge)
 * - Payout (challenge path after Assert, if claimer proves validity)
 */
export interface ClaimerTransactions {
  /** Claimer's public key (hex encoded 32 bytes x-only) */
  claimer_pubkey: string;
  /** Claim transaction (for reference) */
  claim_tx: TransactionData;
  /** PayoutOptimistic transaction (depositor signs input 0) */
  payout_optimistic_tx: TransactionData;
  /** Assert transaction (for reference) */
  assert_tx: TransactionData;
  /** Payout transaction (depositor signs input 0) */
  payout_tx: TransactionData;
}

/**
 * Response for requesting depositor presign transactions
 * Corresponds to: RequestDepositorPresignTransactionsResponse
 */
export interface RequestDepositorPresignTransactionsResponse {
  /** List of transactions for each claimer (VP and VKs) */
  txs: ClaimerTransactions[];
}

/**
 * Progress tracking for challenger-based operations
 * Used across multiple pegin states (GC data, presigning, ACK collection)
 */
export interface ChallengerProgress {
  /** Total number of challengers */
  total_challengers: number;
  /** Number of challengers that have completed */
  completed_challengers: number;
  /** Public keys of completed challengers */
  completed_challenger_pubkeys: string[];
  /** Public keys of pending challengers */
  pending_challenger_pubkeys: string[];
}

/** GC data progress (PendingBabeSetup state) */
export type GcDataProgress = ChallengerProgress;
/** Presigning progress (PendingChallengerPresigning state) */
export type PresigningProgress = ChallengerProgress;
/** ACK collection progress (PendingACKs state) */
export type AckCollectionProgress = ChallengerProgress;

/**
 * Detailed progress information for a PegIn
 * Contains state-specific progress details
 */
export interface PeginProgressDetails {
  /** GC data progress (only present in PendingBabeSetup state) */
  gc_data?: GcDataProgress;
  /** Presigning progress (only present in PendingChallengerPresigning state) */
  presigning?: PresigningProgress;
  /** ACK collection progress (present in PendingACKs state) */
  ack_collection?: AckCollectionProgress;
}

/**
 * Response for getting PegIn status
 * Corresponds to: GetPeginStatusResponse
 */
export interface GetPeginStatusResponse {
  /**
   * The current status of the PegIn in vault provider's database
   * State flow: PendingBabeSetup -> PendingChallengerPresigning -> PendingDepositorSignatures
   *             -> PendingACKs -> PendingActivation -> Activated
   */
  status: string;
  /** Detailed progress information for the current state (may be absent in some states) */
  progress?: PeginProgressDetails;
}

// ============================================================================
// Error Codes
// ============================================================================

/**
 * Error codes that can be returned by the btc-vault RPC service
 * Based on: RpcError enum
 */
export enum RpcErrorCode {
  DATABASE_ERROR = -32005,
  PRESIGN_ERROR = -32006,
  JSON_SERIALIZATION_ERROR = -32007,
  TX_GRAPH_ERROR = -32008,
  INVALID_GRAPH = -32009,
  VALIDATION_ERROR = -32010,
  NOT_FOUND = -32011,
  INTERNAL_ERROR = -32603,
}
