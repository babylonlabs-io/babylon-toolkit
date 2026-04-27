/**
 * Runtime validation for vault provider RPC responses.
 *
 * All VP RPC methods return untyped JSON that TypeScript generics cast without
 * inspection. These validators check the critical top-level fields and
 * security-relevant values (status, txids, pubkeys). Optional progress
 * sub-fields (gc_data, ack_collection, claimer_graphs) are NOT validated
 * since they are informational and not used for signing or transaction
 * construction. Only `progress.presigning` sub-fields are checked.
 */

import {
  COMPRESSED_PUBKEY_HEX_LEN,
  X_ONLY_PUBKEY_HEX_LEN,
} from "../../primitives/utils/bitcoin";
import { HEX_RE } from "../../utils/validation";

import { DaemonStatus } from "./types";
import type {
  GetPeginStatusResponse,
  GetPegoutStatusResponse,
  RequestDepositorClaimerArtifactsResponse,
  RequestDepositorPresignTransactionsResponse,
} from "./types";

const DAEMON_STATUS_VALUES = new Set<string>(Object.values(DaemonStatus));

const VP_ERROR_PREVIEW_MAX_LEN = 200;

function preview(value: unknown): string {
  return (
    JSON.stringify(value)?.slice(0, VP_ERROR_PREVIEW_MAX_LEN) ?? "undefined"
  );
}

const VP_VALIDATION_USER_MESSAGE =
  "The vault provider returned an unexpected response. Please try again or contact support.";

/**
 * Thrown when a VP RPC response fails runtime validation.
 *
 * `.message` is a user-facing string safe to display in the UI.
 * `.detail` contains the technical reason, suitable for logging.
 */
export class VpResponseValidationError extends Error {
  readonly detail: string;

  constructor(detail: string) {
    super(VP_VALIDATION_USER_MESSAGE);
    this.name = "VpResponseValidationError";
    this.detail = detail;
  }
}

/** Expected length (in hex chars) of a Bitcoin transaction ID (32 bytes). */
const TXID_HEX_LEN = 64;

function isNonEmptyHex(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && HEX_RE.test(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function assertNonEmptyHex(value: unknown, field: string): void {
  if (!isNonEmptyHex(value)) {
    throw new VpResponseValidationError(
      `VP response validation failed: "${field}" must be a non-empty hex string, got ${preview(value)}`,
    );
  }
}

function assertNonEmptyString(value: unknown, field: string): void {
  if (!isNonEmptyString(value)) {
    throw new VpResponseValidationError(
      `VP response validation failed: "${field}" must be a non-empty string, got ${preview(value)}`,
    );
  }
}

/**
 * Accept both x-only (64-char) and compressed (66-char) pubkeys from VP responses.
 * The signing code normalizes to x-only via processPublicKeyToXOnly().
 */
function assertBtcPubkey(value: unknown, field: string): void {
  if (
    !isNonEmptyHex(value) ||
    (value.length !== X_ONLY_PUBKEY_HEX_LEN &&
      value.length !== COMPRESSED_PUBKEY_HEX_LEN)
  ) {
    throw new VpResponseValidationError(
      `VP response validation failed: "${field}" must be a ${X_ONLY_PUBKEY_HEX_LEN} or ${COMPRESSED_PUBKEY_HEX_LEN}-char hex string (BTC pubkey), got ${preview(value)}`,
    );
  }
}

/**
 * Validate the optional presigning progress fields returned inside PeginProgressDetails.
 */
function validatePresigningProgressFields(
  progress: Record<string, unknown>,
): void {
  const presigning = progress.presigning;
  if (presigning === undefined || presigning === null) return;
  if (typeof presigning !== "object" || Array.isArray(presigning)) {
    throw new VpResponseValidationError(
      `VP response validation failed: "progress.presigning" must be an object if present`,
    );
  }

  const p = presigning as Record<string, unknown>;

  if (
    p.depositor_graph_created !== undefined &&
    typeof p.depositor_graph_created !== "boolean"
  ) {
    throw new VpResponseValidationError(
      `VP response validation failed: "progress.presigning.depositor_graph_created" must be a boolean if present, got ${preview(p.depositor_graph_created)}`,
    );
  }

  if (
    p.vk_challenger_presigning_completed !== undefined &&
    typeof p.vk_challenger_presigning_completed !== "number"
  ) {
    throw new VpResponseValidationError(
      `VP response validation failed: "progress.presigning.vk_challenger_presigning_completed" must be a number if present, got ${preview(p.vk_challenger_presigning_completed)}`,
    );
  }

  if (
    p.vk_challenger_presigning_total !== undefined &&
    typeof p.vk_challenger_presigning_total !== "number"
  ) {
    throw new VpResponseValidationError(
      `VP response validation failed: "progress.presigning.vk_challenger_presigning_total" must be a number if present, got ${preview(p.vk_challenger_presigning_total)}`,
    );
  }
}

/**
 * Validate a getPeginStatus response.
 *
 * Throws if the status field is not a recognized DaemonStatus value.
 */
export function validateGetPeginStatusResponse(
  response: unknown,
): asserts response is GetPeginStatusResponse {
  if (response === null || typeof response !== "object") {
    throw new VpResponseValidationError(
      `VP response validation failed: getPeginStatus response is not an object`,
    );
  }

  const r = response as Record<string, unknown>;

  if (!isNonEmptyHex(r.pegin_txid) || r.pegin_txid.length !== TXID_HEX_LEN) {
    throw new VpResponseValidationError(
      `VP response validation failed: "pegin_txid" must be a ${TXID_HEX_LEN}-char hex string (txid), got ${preview(r.pegin_txid)}`,
    );
  }

  if (typeof r.status !== "string") {
    throw new VpResponseValidationError(
      `VP response validation failed: "status" must be a string`,
    );
  }

  if (!DAEMON_STATUS_VALUES.has(r.status)) {
    throw new VpResponseValidationError(
      `VP response validation failed: unrecognized status "${r.status}". Expected one of: ${[...DAEMON_STATUS_VALUES].join(", ")}`,
    );
  }

  if (
    r.progress === null ||
    typeof r.progress !== "object" ||
    Array.isArray(r.progress)
  ) {
    throw new VpResponseValidationError(
      `VP response validation failed: "progress" must be an object`,
    );
  }

  validatePresigningProgressFields(r.progress as Record<string, unknown>);

  if (typeof r.health_info !== "string") {
    throw new VpResponseValidationError(
      `VP response validation failed: "health_info" must be a string`,
    );
  }

  if (r.last_error !== undefined && typeof r.last_error !== "string") {
    throw new VpResponseValidationError(
      `VP response validation failed: "last_error" must be a string if present, got ${preview(r.last_error)}`,
    );
  }
}

/**
 * Validate a requestDepositorPresignTransactions response.
 */
export function validateRequestDepositorPresignTransactionsResponse(
  response: unknown,
): asserts response is RequestDepositorPresignTransactionsResponse {
  if (response === null || typeof response !== "object") {
    throw new VpResponseValidationError(
      `VP response validation failed: requestDepositorPresignTransactions response is not an object`,
    );
  }

  const r = response as Record<string, unknown>;

  if (!Array.isArray(r.txs)) {
    throw new VpResponseValidationError(
      `VP response validation failed: "txs" must be an array`,
    );
  }

  for (let i = 0; i < r.txs.length; i++) {
    validateClaimerTransactions(r.txs[i], `txs[${i}]`);
  }

  if (r.depositor_graph === null || typeof r.depositor_graph !== "object") {
    throw new VpResponseValidationError(
      `VP response validation failed: "depositor_graph" must be an object`,
    );
  }

  validateDepositorGraphTransactions(
    r.depositor_graph as Record<string, unknown>,
  );
}

function validateTransactionData(value: unknown, field: string): void {
  if (value === null || typeof value !== "object") {
    throw new VpResponseValidationError(
      `VP response validation failed: "${field}" must be an object`,
    );
  }
  const tx = value as Record<string, unknown>;
  assertNonEmptyHex(tx.tx_hex, `${field}.tx_hex`);
}

function validateClaimerTransactions(value: unknown, field: string): void {
  if (value === null || typeof value !== "object") {
    throw new VpResponseValidationError(
      `VP response validation failed: "${field}" must be an object`,
    );
  }

  const tx = value as Record<string, unknown>;

  assertBtcPubkey(tx.claimer_pubkey, `${field}.claimer_pubkey`);
  validateTransactionData(tx.claim_tx, `${field}.claim_tx`);
  validateTransactionData(tx.assert_tx, `${field}.assert_tx`);
  validateTransactionData(tx.payout_tx, `${field}.payout_tx`);
  assertNonEmptyString(tx.payout_psbt, `${field}.payout_psbt`);
}

function validateChallengeAssertConnectorData(
  value: unknown,
  field: string,
): void {
  if (value === null || typeof value !== "object") {
    throw new VpResponseValidationError(
      `VP response validation failed: "${field}" must be an object`,
    );
  }

  const c = value as Record<string, unknown>;
  assertNonEmptyString(c.wots_pks_json, `${field}.wots_pks_json`);
  assertNonEmptyString(c.gc_wots_keys_json, `${field}.gc_wots_keys_json`);
}

function validatePresignDataPerChallenger(value: unknown, field: string): void {
  if (value === null || typeof value !== "object") {
    throw new VpResponseValidationError(
      `VP response validation failed: "${field}" must be an object`,
    );
  }

  const d = value as Record<string, unknown>;

  assertBtcPubkey(d.challenger_pubkey, `${field}.challenger_pubkey`);
  validateTransactionData(
    d.challenge_assert_x_tx,
    `${field}.challenge_assert_x_tx`,
  );
  validateTransactionData(
    d.challenge_assert_y_tx,
    `${field}.challenge_assert_y_tx`,
  );
  validateTransactionData(d.nopayout_tx, `${field}.nopayout_tx`);
  assertNonEmptyString(d.nopayout_psbt, `${field}.nopayout_psbt`);

  if (!Array.isArray(d.challenge_assert_connectors)) {
    throw new VpResponseValidationError(
      `VP response validation failed: "${field}.challenge_assert_connectors" must be an array`,
    );
  }

  for (let i = 0; i < d.challenge_assert_connectors.length; i++) {
    validateChallengeAssertConnectorData(
      d.challenge_assert_connectors[i],
      `${field}.challenge_assert_connectors[${i}]`,
    );
  }

  if (!Array.isArray(d.output_label_hashes)) {
    throw new VpResponseValidationError(
      `VP response validation failed: "${field}.output_label_hashes" must be an array`,
    );
  }

  for (let i = 0; i < d.output_label_hashes.length; i++) {
    assertNonEmptyHex(
      d.output_label_hashes[i],
      `${field}.output_label_hashes[${i}]`,
    );
  }
}

/**
 * Validate a requestDepositorClaimerArtifacts response.
 */
export function validateRequestDepositorClaimerArtifactsResponse(
  response: unknown,
): asserts response is RequestDepositorClaimerArtifactsResponse {
  if (response === null || typeof response !== "object") {
    throw new VpResponseValidationError(
      `VP response validation failed: requestDepositorClaimerArtifacts response is not an object`,
    );
  }

  const r = response as Record<string, unknown>;

  if (!isNonEmptyString(r.tx_graph_json)) {
    throw new VpResponseValidationError(
      `VP response validation failed: "tx_graph_json" must be a non-empty string, got ${preview(r.tx_graph_json)}`,
    );
  }

  if (!isNonEmptyHex(r.verifying_key_hex)) {
    throw new VpResponseValidationError(
      `VP response validation failed: "verifying_key_hex" must be a non-empty hex string, got ${preview(r.verifying_key_hex)}`,
    );
  }

  if (r.babe_sessions === null || typeof r.babe_sessions !== "object") {
    throw new VpResponseValidationError(
      `VP response validation failed: "babe_sessions" must be an object`,
    );
  }

  for (const [key, session] of Object.entries(
    r.babe_sessions as Record<string, unknown>,
  )) {
    if (session === null || typeof session !== "object") {
      throw new VpResponseValidationError(
        `VP response validation failed: "babe_sessions.${key}" must be an object`,
      );
    }
    const s = session as Record<string, unknown>;
    if (!isNonEmptyHex(s.decryptor_artifacts_hex)) {
      throw new VpResponseValidationError(
        `VP response validation failed: "babe_sessions.${key}.decryptor_artifacts_hex" must be a non-empty hex string, got ${preview(s.decryptor_artifacts_hex)}`,
      );
    }
  }
}

/**
 * Validate a getPegoutStatus response.
 */
export function validateGetPegoutStatusResponse(
  response: unknown,
): asserts response is GetPegoutStatusResponse {
  if (response === null || typeof response !== "object") {
    throw new VpResponseValidationError(
      `VP response validation failed: getPegoutStatus response is not an object`,
    );
  }

  const r = response as Record<string, unknown>;

  if (!isNonEmptyHex(r.pegin_txid) || r.pegin_txid.length !== TXID_HEX_LEN) {
    throw new VpResponseValidationError(
      `VP response validation failed: "pegin_txid" must be a ${TXID_HEX_LEN}-char hex string (txid), got ${preview(r.pegin_txid)}`,
    );
  }

  if (typeof r.found !== "boolean") {
    throw new VpResponseValidationError(
      `VP response validation failed: "found" must be a boolean, got ${preview(r.found)}`,
    );
  }

  if (r.claimer !== undefined) {
    if (r.claimer === null || typeof r.claimer !== "object") {
      throw new VpResponseValidationError(
        `VP response validation failed: "claimer" must be an object if present`,
      );
    }
    const claimer = r.claimer as Record<string, unknown>;
    if (typeof claimer.status !== "string") {
      throw new VpResponseValidationError(
        `VP response validation failed: "claimer.status" must be a string, got ${preview(claimer.status)}`,
      );
    }
    if (typeof claimer.failed !== "boolean") {
      throw new VpResponseValidationError(
        `VP response validation failed: "claimer.failed" must be a boolean, got ${preview(claimer.failed)}`,
      );
    }
  }

  if (r.challenger !== undefined) {
    if (r.challenger === null || typeof r.challenger !== "object") {
      throw new VpResponseValidationError(
        `VP response validation failed: "challenger" must be an object if present`,
      );
    }
    const challenger = r.challenger as Record<string, unknown>;
    if (typeof challenger.status !== "string") {
      throw new VpResponseValidationError(
        `VP response validation failed: "challenger.status" must be a string, got ${preview(challenger.status)}`,
      );
    }
  }
}

function validateDepositorGraphTransactions(
  graph: Record<string, unknown>,
): void {
  validateTransactionData(graph.claim_tx, "depositor_graph.claim_tx");
  validateTransactionData(graph.assert_tx, "depositor_graph.assert_tx");
  validateTransactionData(graph.payout_tx, "depositor_graph.payout_tx");
  assertNonEmptyString(graph.payout_psbt, "depositor_graph.payout_psbt");

  if (!Array.isArray(graph.challenger_presign_data)) {
    throw new VpResponseValidationError(
      `VP response validation failed: "depositor_graph.challenger_presign_data" must be an array`,
    );
  }

  for (let i = 0; i < graph.challenger_presign_data.length; i++) {
    validatePresignDataPerChallenger(
      graph.challenger_presign_data[i],
      `depositor_graph.challenger_presign_data[${i}]`,
    );
  }

  if (typeof graph.offchain_params_version !== "number") {
    throw new VpResponseValidationError(
      `VP response validation failed: "depositor_graph.offchain_params_version" must be a number`,
    );
  }
}
