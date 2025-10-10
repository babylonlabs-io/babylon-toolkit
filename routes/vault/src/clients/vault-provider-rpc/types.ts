/**
 * Type definitions for vault provider RPC API
 *
 * Source: https://github.com/babylonlabs-io/btc-vault/blob/main/crates/vaultd/src/rpc/types.rs
 * Last synced: 2025-10-09
 */

// ============================================================================
// Request Parameter Types
// ============================================================================

/**
 * Parameters for requesting claim and payout transactions
 * Corresponds to: RequestClaimAndPayoutTransactionsParams (types.rs:120-126)
 */
export interface RequestClaimAndPayoutTransactionsParams {
  /** Hash of the PegIn transaction in BTC hex format */
  pegin_tx_hash: string;
  /** Hex encoded 33 byte BTC public key of the depositor */
  depositor_pk: string;
}

/**
 * Parameters for submitting payout signatures
 * Corresponds to: SubmitPayoutSignaturesParams (types.rs:129-139)
 */
export interface SubmitPayoutSignaturesParams {
  /** The PegIn transaction ID (hex encoded txid) */
  pegin_tx_id: string;
  /** Depositor's public key (hex encoded 33 bytes) */
  depositor_pk: string;
  /** Map of transaction ID to signature */
  signatures: Record<string, string>;
}

// ============================================================================
// Response Types
// ============================================================================

/**
 * Transaction data in the response
 * Corresponds to: TransactionData (types.rs:153-157)
 */
export interface TransactionData {
  /** Transaction hex */
  tx_hex: string;
}

/**
 * Single claimer's transactions
 * Corresponds to: ClaimerTransactions (types.rs:160-168)
 */
export interface ClaimerTransactions {
  /** Claimer's public key (hex encoded 33 bytes) */
  claimer_pubkey: string;
  /** Claim transaction */
  claim_tx: TransactionData;
  /** Payout transaction */
  payout_tx: TransactionData;
}

/**
 * Response for requesting claim and payout transactions
 * Corresponds to: RequestClaimAndPayoutTransactionsResponse (types.rs:171-175)
 */
export interface RequestClaimAndPayoutTransactionsResponse {
  /** List of transactions for each claimer (VP and L) */
  txs: ClaimerTransactions[];
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
