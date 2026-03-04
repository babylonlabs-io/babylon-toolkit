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

/** Previous output data needed for PSBT construction. */
export interface PrevoutData {
  script_pubkey: string;
  value: number;
}

/** Connector data for building ChallengeAssert PSBTs. */
export interface ChallengeAssertConnectorData {
  lamport_hashes_json: string;
  gc_input_label_hashes_json: string;
}

/** Set of transactions the depositor must pre-sign for a single claimer. */
export interface ClaimerTransactions {
  claimer_pubkey: string;
  claim_tx: TransactionData;
  assert_tx: TransactionData;
  payout_tx: TransactionData;
  /** Sighash for the payout transaction (hex, present when depositor-as-claimer). */
  payout_sighash?: string;
  /** Prevouts for building payout PSBT. */
  payout_prevouts?: PrevoutData[];
}

/** Challenger-specific transactions and signing data for the depositor graph. */
export interface PresignDataPerChallenger {
  challenger_pubkey: string;
  challenge_assert_tx: TransactionData;
  nopayout_tx: TransactionData;
  /** 3 sighashes for the ChallengeAssert transactions. */
  challenge_assert_sighashes: [string, string, string];
  /** Sighash for the NoPayout transaction. */
  nopayout_sighash: string;
  /** Connector data for building ChallengeAssert PSBTs (one per ChallengeAssert tx). */
  challenge_assert_connectors: [
    ChallengeAssertConnectorData,
    ChallengeAssertConnectorData,
    ChallengeAssertConnectorData,
  ];
  /** Prevouts for all ChallengeAssert inputs (flat, one per input). */
  challenge_assert_prevouts: PrevoutData[];
  /** Prevouts for building NoPayout PSBT. */
  nopayout_prevouts: PrevoutData[];
  /** Output label hashes for this challenger (used in GC verification). */
  output_label_hashes?: string[];
}

/** Depositor-as-claimer TxGraph transactions (claim, assert, payout + challengers). */
export interface DepositorGraphTransactions {
  claim_tx: TransactionData;
  assert_tx: TransactionData;
  payout_tx: TransactionData;
  challenger_presign_data: PresignDataPerChallenger[];
  /** Sighash for the depositor's payout transaction. */
  payout_sighash: string;
  /** Prevouts for building the depositor's payout PSBT. */
  payout_prevouts: PrevoutData[];
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
