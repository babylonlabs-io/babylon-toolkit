/**
 * Type definitions for vault provider RPC API
 *
 * Source: https://github.com/babylonlabs-io/btc-vault/blob/main/docs/pegin.md
 */

import type { LamportPublicKey } from "@/services/lamport";

// ============================================================================
// Request Parameter Types
// ============================================================================

/** Params for requesting the payout/claim/assert transactions to pre-sign. */
export interface RequestDepositorPresignTransactionsParams {
  pegin_txid: string;
  depositor_pk: string;
}

/** Params for submitting the depositor's Lamport public key to the VP. */
export interface SubmitDepositorLamportKeyParams {
  pegin_txid: string;
  depositor_pk: string;
  lamport_public_key: LamportPublicKey;
}

/** Per-challenger signatures for the depositor-as-claimer flow. */
export interface DepositorPreSigsPerChallenger {
  challenge_assert_signatures: [string, string, string];
  nopayout_signature: string;
}

/** Depositor-as-claimer pre-signatures (payout + per-challenger). */
export interface DepositorAsClaimerPresignatures {
  payout_signatures: ClaimerSignatures;
  per_challenger: Record<string, DepositorPreSigsPerChallenger>;
}

/** Params for submitting depositor pre-signatures including claimer presignatures. */
export interface SubmitDepositorPresignaturesParams {
  pegin_txid: string;
  depositor_pk: string;
  signatures: Record<string, ClaimerSignatures>;
  depositor_claimer_presignatures: DepositorAsClaimerPresignatures;
}

/** Payout signatures per claimer (optimistic + standard). */
export interface ClaimerSignatures {
  payout_optimistic_signature?: string;
  payout_signature: string;
}

/** Params for submitting payout transaction signatures. */
export interface SubmitPayoutSignaturesParams {
  pegin_txid: string;
  depositor_pk: string;
  signatures: Record<string, ClaimerSignatures>;
}

/** Params for requesting BaBe DecryptorArtifacts from the VP. */
export interface RequestDepositorClaimerArtifactsParams {
  pegin_txid: string;
  depositor_pk: string;
}

/** Params for querying pegin status from the VP daemon. */
export interface GetPeginStatusParams {
  pegin_txid: string;
}

// ============================================================================
// Response Types
// ============================================================================

/** A raw Bitcoin transaction with its hex encoding and optional sighash. */
export interface TransactionData {
  tx_hex: string;
  sighash: string | null;
}

/** Set of transactions the depositor must pre-sign for a single claimer. */
export interface ClaimerTransactions {
  claimer_pubkey: string;
  claim_tx: TransactionData;
  assert_tx: TransactionData;
  payout_tx: TransactionData;
  payout_optimistic_tx: TransactionData;
}

/** Challenger-specific transactions the depositor must pre-sign. */
export interface ChallengerPresignData {
  challenger_pubkey: string;
  challenge_assert_tx: TransactionData;
  nopayout_tx: TransactionData;
}

/** Depositor-as-claimer TxGraph transactions (claim, assert, payout + challengers). */
export interface DepositorGraphTransactions {
  claim_tx: TransactionData;
  assert_tx: TransactionData;
  payout_tx: TransactionData;
  challenger_presign_data: ChallengerPresignData[];
}

/** Response from `requestDepositorPresignTransactions`. */
export interface RequestDepositorPresignTransactionsResponse {
  txs: ClaimerTransactions[];
  /** Present when depositor-as-claimer is enabled. */
  depositor_graph?: DepositorGraphTransactions;
}

/** BaBe garbled-circuit session data for a single challenger. */
export interface BaBeSessionData {
  decryptor_artifacts_hex: string;
}

/** Response from `requestDepositorClaimerArtifacts`. */
export interface RequestDepositorClaimerArtifactsResponse {
  tx_graph_json: string;
  verifying_key_hex: string;
  babe_sessions: Record<string, BaBeSessionData>;
}

/** Progress tracker for a multi-challenger operation. */
export interface ChallengerProgress {
  total_challengers: number;
  completed_challengers: number;
  completed_challenger_pubkeys: string[];
  pending_challenger_pubkeys: string[];
}

export type BabeSetupProgress = ChallengerProgress;
export type PresigningProgress = ChallengerProgress;
export type AckCollectionProgress = ChallengerProgress;

/** Detailed progress breakdown for an in-progress pegin. */
export interface PeginProgressDetails {
  babe_setup?: BabeSetupProgress;
  presigning?: PresigningProgress;
  ack_collection?: AckCollectionProgress;
}

/** Response from `getPeginStatus`. */
export interface GetPeginStatusResponse {
  status: string;
  progress?: PeginProgressDetails;
}

// ============================================================================
// Error Codes
// ============================================================================

/** JSON-RPC error codes returned by the vault provider. */
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
