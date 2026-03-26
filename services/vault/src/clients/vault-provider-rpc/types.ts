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
  /** Depositor-as-claimer presignatures. */
  depositor_claimer_presignatures: DepositorAsClaimerPresignatures;
}

/** Payout signatures per claimer. */
export interface ClaimerSignatures {
  payout_signature: string;
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

/** A raw Bitcoin transaction with its hex encoding. */
export interface TransactionData {
  tx_hex: string;
}

/** Connector data for ChallengeAssert inputs (server-generated label hashes). */
export interface ChallengeAssertConnectorData {
  lamport_hashes_json: string;
  gc_input_label_hashes_json: string;
}

/** Set of transactions the depositor must pre-sign for a single claimer (VP or VK graph). */
export interface ClaimerTransactions {
  claimer_pubkey: string;
  claim_tx: TransactionData;
  assert_tx: TransactionData;
  payout_tx: TransactionData;
  /** Unsigned PSBT (base64) for the Payout transaction — embeds prevouts, scripts, and taproot metadata. */
  payout_psbt: string;
}

/** Challenger-specific transactions and signing data for the depositor graph. */
export interface PresignDataPerChallenger {
  challenger_pubkey: string;
  challenge_assert_tx: TransactionData;
  nopayout_tx: TransactionData;
  /** Unsigned PSBT (base64) for the ChallengeAssert transaction (all 3 inputs). */
  challenge_assert_psbt: string;
  /** Unsigned PSBT (base64) for the NoPayout transaction (input 0). */
  nopayout_psbt: string;
  /** Per-segment connector data for ChallengeAssert inputs (one per UTXO segment). */
  challenge_assert_connectors: [
    ChallengeAssertConnectorData,
    ChallengeAssertConnectorData,
    ChallengeAssertConnectorData,
  ];
  /** Output label hashes for this challenger (used in GC verification). */
  output_label_hashes: string[];
}

/** Depositor-as-claimer TxGraph transactions (claim, assert, payout + challengers). */
export interface DepositorGraphTransactions {
  claim_tx: TransactionData;
  assert_tx: TransactionData;
  payout_tx: TransactionData;
  /** Unsigned PSBT (base64) for the Payout transaction — embeds prevouts, scripts, and taproot metadata. */
  payout_psbt: string;
  challenger_presign_data: PresignDataPerChallenger[];
  /** Offchain params version used when constructing this graph. */
  offchain_params_version: number;
}

/** Response from `requestDepositorPresignTransactions`. */
export interface RequestDepositorPresignTransactionsResponse {
  txs: ClaimerTransactions[];
  depositor_graph: DepositorGraphTransactions;
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

export type GcDataProgress = ChallengerProgress;
export type PresigningProgress = ChallengerProgress;
export type AckCollectionProgress = ChallengerProgress;

/** Detailed progress breakdown for an in-progress pegin. */
export interface PeginProgressDetails {
  gc_data?: GcDataProgress;
  presigning?: PresigningProgress;
  ack_collection?: AckCollectionProgress;
  claimer_graphs?: ClaimerGraphStatus[];
}

/** Per-claimer graph status (challenger perspective). */
export interface ClaimerGraphStatus {
  claimer_pubkey: string;
  presigned: boolean;
}

/** Response from `getPeginStatus`. */
export interface GetPeginStatusResponse {
  pegin_txid: string;
  status: string;
  progress: PeginProgressDetails;
  health_info: string;
  last_error?: string;
}

// ============================================================================
// Pegout Types
// ============================================================================

/** Params for querying pegout status from the VP daemon. */
export interface GetPegoutStatusParams {
  pegin_txid: string;
}

/** Claimer-side pegout progress. */
export interface ClaimerPegoutStatus {
  status: string;
  failed: boolean;
  claim_txid?: string;
  claimer_pubkey?: string;
  challenger_pubkey?: string;
  created_at?: string;
  updated_at?: string;
}

/** Challenger-side pegout progress. */
export interface ChallengerPegoutStatus {
  status: string;
  claim_txid?: string;
  claimer_pubkey?: string;
  assert_txid?: string;
  challenge_assert_txid?: string;
  nopayout_txid?: string;
  created_at?: string;
  updated_at?: string;
}

/** Response from `getPegoutStatus`. */
export interface GetPegoutStatusResponse {
  pegin_txid: string;
  found: boolean;
  claimer?: ClaimerPegoutStatus;
  challenger?: ChallengerPegoutStatus;
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
