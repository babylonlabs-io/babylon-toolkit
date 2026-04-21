/**
 * Type definitions for Vault Provider JSON-RPC API.
 *
 * These types match the `vaultProvider_*` RPC namespace defined by the
 * btc-vault daemon. They are the SDK's canonical copy of the VP protocol
 * contract, independent of any frontend framework.
 *
 * @see https://github.com/babylonlabs-io/btc-vault/blob/main/docs/pegin.md
 */

// ============================================================================
// Daemon Status
// ============================================================================

/**
 * Backend daemon status (vault provider database).
 * Source: btc-vault crates/vaultd/src/workers/claimer/mod.rs PegInStatus enum
 *
 * State flow (happy path):
 * PendingIngestion -> PendingDepositorWotsPK -> PendingBabeSetup -> PendingChallengerPresigning
 *   -> PendingPeginSigsAvailability -> PendingPrePegInConfirmations
 *   -> PendingDepositorSignatures -> PendingACKs -> PendingActivation -> Activated
 *
 * Terminal / branching states:
 * - Expired: vault timed out before activation
 * - ClaimPosted: claim transaction posted on-chain
 * - PeggedOut: BTC has been returned to the depositor
 */
export enum DaemonStatus {
  PENDING_INGESTION = "PendingIngestion",
  PENDING_DEPOSITOR_WOTS_PK = "PendingDepositorWotsPK",
  PENDING_BABE_SETUP = "PendingBabeSetup",
  PENDING_CHALLENGER_PRESIGNING = "PendingChallengerPresigning",
  PENDING_PEGIN_SIGS_AVAILABILITY = "PendingPeginSigsAvailability",
  PENDING_PRE_PEGIN_CONFIRMATIONS = "PendingPrePegInConfirmations",
  PENDING_DEPOSITOR_SIGNATURES = "PendingDepositorSignatures",
  PENDING_ACKS = "PendingACKs",
  PENDING_ACTIVATION = "PendingActivation",
  ACTIVATED = "Activated",
  EXPIRED = "Expired",
  CLAIM_POSTED = "ClaimPosted",
  PEGGED_OUT = "PeggedOut",
}

// ============================================================================
// Status Groups
// ============================================================================

/**
 * States where the VP is still processing (no depositor action needed).
 * Excludes PENDING_DEPOSITOR_WOTS_PK (requires depositor action).
 */
export const PRE_DEPOSITOR_SIGNATURES_STATES: readonly DaemonStatus[] = [
  DaemonStatus.PENDING_INGESTION,
  DaemonStatus.PENDING_BABE_SETUP,
  DaemonStatus.PENDING_CHALLENGER_PRESIGNING,
  DaemonStatus.PENDING_PEGIN_SIGS_AVAILABILITY,
  DaemonStatus.PENDING_PRE_PEGIN_CONFIRMATIONS,
];

/** States after PendingDepositorSignatures where the depositor has no action. */
const POST_PAYOUT_SIGNATURE_STATUSES: readonly DaemonStatus[] = [
  DaemonStatus.PENDING_ACKS,
  DaemonStatus.PENDING_ACTIVATION,
  DaemonStatus.ACTIVATED,
];

/**
 * Statuses where no depositor action is needed (VP processing or already past
 * depositor interaction). Excludes PENDING_INGESTION and PENDING_DEPOSITOR_WOTS_PK.
 */
export const VP_TRANSIENT_STATUSES: ReadonlySet<DaemonStatus> = new Set([
  DaemonStatus.PENDING_BABE_SETUP,
  DaemonStatus.PENDING_CHALLENGER_PRESIGNING,
  DaemonStatus.PENDING_PEGIN_SIGS_AVAILABILITY,
  DaemonStatus.PENDING_PRE_PEGIN_CONFIRMATIONS,
  ...POST_PAYOUT_SIGNATURE_STATUSES,
]);

/**
 * Terminal VP statuses where no further progress is possible.
 * If the VP reaches one of these states while polling, polling should
 * stop immediately with an error rather than waiting for timeout.
 */
export const VP_TERMINAL_STATUSES: ReadonlySet<DaemonStatus> = new Set([
  DaemonStatus.EXPIRED,
  DaemonStatus.CLAIM_POSTED,
  DaemonStatus.PEGGED_OUT,
]);

/**
 * Statuses that come after WOTS key submission.
 * If the VP is already in one of these states, the WOTS key was already
 * submitted and we can skip.
 */
export const POST_WOTS_STATUSES: ReadonlySet<DaemonStatus> = new Set([
  ...VP_TRANSIENT_STATUSES,
  DaemonStatus.PENDING_DEPOSITOR_SIGNATURES,
]);

// ============================================================================
// WOTS Types (needed by SubmitDepositorWotsKeyParams)
// ============================================================================

/**
 * WOTS configuration for a single block.
 * Matches Rust `babe::wots::Config` serde format.
 */
export interface WotsConfig {
  /** Digit bit-width (e.g. 4 → base-16 digits). */
  d: number;
  /** Number of message digits in this block. */
  n: number;
  /** Radix used for the checksum computation. */
  checksum_radix: number;
}

/**
 * A single block of WOTS public keys.
 * Chain values are arrays of byte values (matching Rust `[u8; 20]`).
 */
export interface WotsBlockPublicKey {
  config: WotsConfig;
  message_terminals: number[][];
  checksum_major_terminal: number[];
  checksum_minor_terminal: number[];
}

// ============================================================================
// Request Parameter Types
// ============================================================================

/** Params for requesting the payout/claim/assert transactions to pre-sign. */
export interface RequestDepositorPresignTransactionsParams {
  pegin_txid: string;
  depositor_pk: string;
}

/** Params for submitting the depositor's WOTS public key to the VP. */
export interface SubmitDepositorWotsKeyParams {
  pegin_txid: string;
  depositor_pk: string;
  wots_public_keys: WotsBlockPublicKey[];
}

/** Per-challenger signatures for the depositor-as-claimer flow. */
export interface DepositorPreSigsPerChallenger {
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

/** Payout signatures per claimer. */
export interface ClaimerSignatures {
  payout_signature: string;
}

/** Params for requesting BaBe DecryptorArtifacts from the VP. */
export interface RequestDepositorClaimerArtifactsParams {
  pegin_txid: string;
  depositor_pk: string;
}

/** Params for querying pegin status. Either pegin_txid or vault_id must be provided. */
export type GetPeginStatusParams =
  | { pegin_txid: string; vault_id?: never }
  | { vault_id: string; pegin_txid?: never };

// ============================================================================
// Response Types
// ============================================================================

/** A raw Bitcoin transaction with its hex encoding. */
export interface TransactionData {
  tx_hex: string;
}

/** Set of transactions the depositor must pre-sign for a single claimer. */
export interface ClaimerTransactions {
  claimer_pubkey: string;
  claim_tx: TransactionData;
  assert_tx: TransactionData;
  payout_tx: TransactionData;
  payout_psbt: string;
}

/** Per-segment connector data for ChallengeAssert inputs. */
export interface ChallengeAssertConnectorData {
  wots_pks_json: string;
  gc_wots_keys_json: string;
}

/** Challenger-specific transactions and signing data for the depositor graph. */
export interface PresignDataPerChallenger {
  challenger_pubkey: string;
  challenge_assert_x_tx: TransactionData;
  challenge_assert_y_tx: TransactionData;
  nopayout_tx: TransactionData;
  nopayout_psbt: string;
  challenge_assert_connectors: ChallengeAssertConnectorData[];
  output_label_hashes: string[];
}

/** Depositor-as-claimer TxGraph transactions. */
export interface DepositorGraphTransactions {
  claim_tx: TransactionData;
  assert_tx: TransactionData;
  payout_tx: TransactionData;
  payout_psbt: string;
  challenger_presign_data: PresignDataPerChallenger[];
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
export type AckCollectionProgress = ChallengerProgress;

/** Extended presigning progress with all 3 concurrent phases. */
export interface PresigningProgress extends ChallengerProgress {
  depositor_graph_created?: boolean;
  vk_challenger_presigning_completed?: number;
  vk_challenger_presigning_total?: number;
}

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
