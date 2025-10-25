/**
 * Type definitions for vault provider RPC API
 *
 * Source: https://github.com/babylonlabs-io/btc-vault/blob/main/crates/vaultd/src/rpc/types.rs
 * Last synced: 2025-10-16
 */

// ============================================================================
// Request Parameter Types
// ============================================================================

/**
 * Parameters for requesting claim and payout transactions
 * Corresponds to: RequestClaimAndPayoutTransactionsParams (types.rs:251-258)
 */
export interface RequestClaimAndPayoutTransactionsParams {
  /** The PegIn transaction ID (hex encoded txid) */
  pegin_tx_id: string;
  /** Hex encoded 32-byte x-only BTC public key of the depositor (no prefix) */
  depositor_pk: string;
}

/**
 * Parameters for submitting payout signatures
 * Corresponds to: SubmitPayoutSignaturesParams (types.rs:260-273)
 */
export interface SubmitPayoutSignaturesParams {
  /** The PegIn transaction ID (hex encoded txid) */
  pegin_tx_id: string;
  /** Depositor's 32-byte x-only BTC public key (hex encoded, no prefix) */
  depositor_pk: string;
  /**
   * Map of claimer public key to depositor's payout signature
   * - Key: Claimer 32-byte x-only public key (VP, hex encoded, no prefix)
   * - Value: Depositor's 64-byte Schnorr signature for that claimer's payout tx (hex encoded)
   */
  signatures: Record<string, string>;
}

/**
 * Parameters for getting PegIn status
 * Corresponds to: GetPeginStatusParams (types.rs:276-281)
 */
export interface GetPeginStatusParams {
  /** The PegIn transaction ID (hex encoded txid) */
  pegin_tx_id: string;
}

/**
 * Parameters for getting PegIn claim transaction graph
 * Corresponds to: GetPeginClaimTxGraphParams (types.rs:196-199)
 */
export interface GetPeginClaimTxGraphParams {
  /** The PegIn transaction ID (hex encoded txid) */
  pegin_tx_id: string;
}

// ============================================================================
// Response Types
// ============================================================================

/**
 * Transaction data in the response
 * Corresponds to: TransactionData (types.rs:277-281)
 */
export interface TransactionData {
  /** Transaction hex */
  tx_hex: string;
}

/**
 * Single claimer's transactions
 * Corresponds to: ClaimerTransactions (types.rs:326-335)
 */
export interface ClaimerTransactions {
  /** Claimer's public key (hex encoded) */
  claimer_pubkey: string;
  /** Claim transaction */
  claim_tx: TransactionData;
  /** Payout transaction */
  payout_tx: TransactionData;
}

/**
 * Response for requesting claim and payout transactions
 * Corresponds to: RequestClaimAndPayoutTransactionsResponse (types.rs:337-342)
 */
export interface RequestClaimAndPayoutTransactionsResponse {
  /** List of transactions for each claimer (VP and L) */
  txs: ClaimerTransactions[];
}

/**
 * Response for getting PegIn status
 * Corresponds to: GetPeginStatusResponse (types.rs:354-361)
 */
export interface GetPeginStatusResponse {
  /**
   * The current status of the PegIn in vault provider's database
   * Possible values: "PendingChallengerSignatures", "PendingDepositorSignatures",
   * "Acknowledged", "Activated", "ClaimPosted", "ChallengePeriod", "PeggedOut"
   */
  status: string;
}

/**
 * Response for querying PegIn claim transaction graph
 * Corresponds to: GetPeginClaimTxGraphResponse (types.rs:342-345)
 */
export interface GetPeginClaimTxGraphResponse {
  /** The PegInClaimTxGraph serialized as JSON string */
  graph_json: string;
}

// ============================================================================
// Error Codes
// ============================================================================

/**
 * Error codes that can be returned by the btc-vault RPC service
 * Based on: RpcError enum (error.rs:4-42)
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
