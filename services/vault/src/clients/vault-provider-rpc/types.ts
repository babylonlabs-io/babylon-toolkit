/**
 * Type definitions for vault provider RPC API
 *
 * Source: https://github.com/babylonlabs-io/btc-vaults/blob/main/docs/pegin.md
 */

import type { LamportPublicKey } from "@/services/lamport";

// ============================================================================
// Request Parameter Types
// ============================================================================

export interface RequestDepositorPresignTransactionsParams {
  pegin_txid: string;
  depositor_pk: string;
}

export interface SubmitDepositorLamportKeyParams {
  pegin_txid: string;
  depositor_pk: string;
  lamport_public_key: LamportPublicKey;
}

export interface DepositorPreSigsPerChallenger {
  challenge_assert_signatures: [string, string, string];
  nopayout_signature: string;
}

export interface DepositorAsClaimerPresignatures {
  payout_signatures: ClaimerSignatures;
  per_challenger: Record<string, DepositorPreSigsPerChallenger>;
}

export interface SubmitDepositorPresignaturesParams {
  pegin_txid: string;
  depositor_pk: string;
  signatures: Record<string, ClaimerSignatures>;
  depositor_claimer_presignatures: DepositorAsClaimerPresignatures;
}

export interface ClaimerSignatures {
  payout_optimistic_signature?: string;
  payout_signature: string;
}

export interface SubmitPayoutSignaturesParams {
  pegin_txid: string;
  depositor_pk: string;
  signatures: Record<string, ClaimerSignatures>;
}

export interface RequestDepositorClaimerArtifactsParams {
  pegin_txid: string;
  depositor_pk: string;
}

export interface GetPeginStatusParams {
  pegin_txid: string;
}

// ============================================================================
// Response Types
// ============================================================================

export interface TransactionData {
  tx_hex: string;
  sighash: string | null;
}

export interface ClaimerTransactions {
  claimer_pubkey: string;
  claim_tx: TransactionData;
  assert_tx: TransactionData;
  payout_tx: TransactionData;
  payout_optimistic_tx: TransactionData;
}

export interface ChallengerPresignData {
  challenger_pubkey: string;
  challenge_assert_tx: TransactionData;
  nopayout_tx: TransactionData;
}

export interface DepositorGraphTransactions {
  claim_tx: TransactionData;
  assert_tx: TransactionData;
  payout_tx: TransactionData;
  challenger_presign_data: ChallengerPresignData[];
}

export interface RequestDepositorPresignTransactionsResponse {
  txs: ClaimerTransactions[];
  depositor_graph?: DepositorGraphTransactions;
}

export interface BaBeSessionData {
  decryptor_artifacts_hex: string;
}

export interface RequestDepositorClaimerArtifactsResponse {
  tx_graph_json: string;
  verifying_key_hex: string;
  babe_sessions: Record<string, BaBeSessionData>;
}

export interface ChallengerProgress {
  total_challengers: number;
  completed_challengers: number;
  completed_challenger_pubkeys: string[];
  pending_challenger_pubkeys: string[];
}

export type BabeSetupProgress = ChallengerProgress;
export type PresigningProgress = ChallengerProgress;
export type AckCollectionProgress = ChallengerProgress;

export interface PeginProgressDetails {
  babe_setup?: BabeSetupProgress;
  presigning?: PresigningProgress;
  ack_collection?: AckCollectionProgress;
}

export interface GetPeginStatusResponse {
  status: string;
  progress?: PeginProgressDetails;
}

// ============================================================================
// Error Codes
// ============================================================================

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
