/**
 * Runtime validation for vault provider RPC responses.
 *
 * All VP RPC methods return untyped JSON that TypeScript generics cast without
 * inspection. A malicious or compromised vault provider can return any shape.
 * These validators throw on unexpected data so callers never operate on
 * attacker-controlled inputs.
 */

import { DaemonStatus } from "../../models/peginStateMachine";

import type {
  GetPeginStatusResponse,
  RequestDepositorPresignTransactionsResponse,
} from "./types";

const DAEMON_STATUS_VALUES = new Set<string>(Object.values(DaemonStatus));

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

/** Non-empty string of hexadecimal characters (case-insensitive). */
const HEX_RE = /^[0-9a-fA-F]+$/;

/** Expected length (in hex chars) of an x-only Bitcoin public key (32 bytes). */
const X_ONLY_PUBKEY_HEX_LEN = 64;

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
      `VP response validation failed: "${field}" must be a non-empty hex string, got ${JSON.stringify(value)}`,
    );
  }
}

function assertNonEmptyString(value: unknown, field: string): void {
  if (!isNonEmptyString(value)) {
    throw new VpResponseValidationError(
      `VP response validation failed: "${field}" must be a non-empty string, got ${JSON.stringify(value)}`,
    );
  }
}

function assertXOnlyPubkey(value: unknown, field: string): void {
  if (!isNonEmptyHex(value) || value.length !== X_ONLY_PUBKEY_HEX_LEN) {
    throw new VpResponseValidationError(
      `VP response validation failed: "${field}" must be a ${X_ONLY_PUBKEY_HEX_LEN}-char hex string (x-only pubkey), got ${JSON.stringify(value)}`,
    );
  }
}

/**
 * Validate a getPeginStatus response.
 *
 * Throws if the status field is not a recognized DaemonStatus value.
 * An unrecognized status could be used by a malicious VP to steer the
 * polling logic into an unintended code path (e.g., silently clearing errors).
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
      `VP response validation failed: "pegin_txid" must be a ${TXID_HEX_LEN}-char hex string (txid), got ${JSON.stringify(r.pegin_txid)}`,
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

  if (r.progress === null || typeof r.progress !== "object") {
    throw new VpResponseValidationError(
      `VP response validation failed: "progress" must be an object`,
    );
  }

  if (typeof r.health_info !== "string") {
    throw new VpResponseValidationError(
      `VP response validation failed: "health_info" must be a string`,
    );
  }
}

/**
 * Validate a requestDepositorPresignTransactions response.
 *
 * Strictly checks every field used downstream in PSBT construction.
 * Throws if any tx_hex field is not a valid hex string, if a claimer_pubkey
 * has the wrong format, or if required arrays/objects are missing.
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

  assertXOnlyPubkey(tx.claimer_pubkey, `${field}.claimer_pubkey`);
  validateTransactionData(tx.claim_tx, `${field}.claim_tx`);
  validateTransactionData(tx.assert_tx, `${field}.assert_tx`);
  validateTransactionData(tx.payout_tx, `${field}.payout_tx`);
  assertNonEmptyString(tx.payout_psbt, `${field}.payout_psbt`);
}

function validatePresignDataPerChallenger(value: unknown, field: string): void {
  if (value === null || typeof value !== "object") {
    throw new VpResponseValidationError(
      `VP response validation failed: "${field}" must be an object`,
    );
  }

  const d = value as Record<string, unknown>;

  assertXOnlyPubkey(d.challenger_pubkey, `${field}.challenger_pubkey`);
  validateTransactionData(
    d.challenge_assert_tx,
    `${field}.challenge_assert_tx`,
  );
  validateTransactionData(d.nopayout_tx, `${field}.nopayout_tx`);
  assertNonEmptyString(
    d.challenge_assert_psbt,
    `${field}.challenge_assert_psbt`,
  );
  assertNonEmptyString(d.nopayout_psbt, `${field}.nopayout_psbt`);
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
