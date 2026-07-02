/**
 * Service for fetching and downloading BaBe Decryptor artifacts.
 *
 * These artifacts are required for the depositor to independently claim
 * their vault funds. They are retrieved from the vault provider after
 * the WOTS key has been submitted and the vault is fully set up.
 *
 * Artifacts can be very large (~450 MB today). The raw response body is
 * retained as a Blob so the download step does not need to re-serialize
 * it, and payloads above an RPC-error-sized threshold are not parsed on
 * the main thread (doing so would risk exceeding V8's string length limit
 * or freezing the tab). Full schema validation of the artifact body is
 * deferred until the backend delivers artifacts via streaming; for now
 * only small responses (expected to be JSON-RPC error envelopes) are
 * parsed and validated.
 */

import { stripHexPrefix } from "@babylonlabs-io/ts-sdk/tbv/core";
import {
  JSON_RPC_ERROR_CODES,
  JsonRpcClient,
  JsonRpcError,
  validateRequestDepositorClaimerArtifactsResponse,
  VpResponseValidationError,
  vpTokenRegistry,
} from "@babylonlabs-io/ts-sdk/tbv/core/clients";

import { getVpProxyUrl } from "@/utils/rpc";

/** Timeout for the artifact request RPC call (artifacts can be large). */
const RPC_TIMEOUT_MS = 120 * 1000;

/**
 * Error responses are typically small; artifact payloads can be hundreds
 * of MB. Only responses under this threshold are parsed on the main thread.
 */
const ERROR_RESPONSE_SIZE_THRESHOLD = 4096;

/**
 * How many leading bytes of a large response we decode to structurally check
 * its JSON-RPC envelope. A genuine success envelope serializes
 * `jsonrpc`/`result` before the (huge) artifact value, so the start of the
 * body is enough to distinguish a success envelope from an error envelope or
 * non-JSON garbage.
 */
const PREFIX_VALIDATION_BYTES = 64 * 1024;

/**
 * Fetch artifacts from the vault provider and trigger a browser file download.
 *
 * Uses JsonRpcClient.callRaw() so the raw response body can be preserved as
 * a Blob for download without a separate re-serialization pass. Small
 * responses (JSON-RPC error envelopes) are fully parsed and schema-validated
 * before the download fires. Large artifact payloads cannot be parsed on the
 * main thread, so they are validated structurally via their JSON-RPC envelope
 * prefix; full validation of the artifact body is deferred to the streaming
 * work.
 *
 * @param providerAddress - Vault provider's Ethereum address.
 * @param peginTxid       - Bitcoin pegin transaction ID (hex, with or without 0x prefix).
 * @param depositorPk     - Depositor's Bitcoin public key.
 */
export async function fetchAndDownloadArtifacts(
  providerAddress: string,
  peginTxid: string,
  depositorPk: string,
): Promise<void> {
  const normalizedPeginTxid = stripHexPrefix(peginTxid);

  // The caller (useArtifactDownload) primes the bearer before invoking
  // this service when the registry is cold, so peek() returns the active
  // provider and the request goes out with a valid Authorization header
  // for this auth-gated RPC. `callRaw` does not reactively refresh on
  // `auth_expired`, so a token that expires mid-download bubbles up as
  // an error and the caller's auth-failure retry path handles re-priming.
  const tokenProvider = vpTokenRegistry.peek(normalizedPeginTxid);

  const client = new JsonRpcClient({
    baseUrl: getVpProxyUrl(providerAddress),
    timeout: RPC_TIMEOUT_MS,
    // Artifact requests are idempotent reads — safe to retry on transient errors
    retryableFor: () => true,
    tokenProvider,
  });

  const response = await client.callRaw(
    "vaultProvider_requestDepositorClaimerArtifacts",
    {
      pegin_txid: normalizedPeginTxid,
      depositor_pk: stripHexPrefix(depositorPk),
    },
  );

  const buffer = await response.arrayBuffer();
  const blob = new Blob([buffer], { type: "application/json" });

  validateArtifactPayload(buffer);

  triggerBlobDownload(blob, peginTxid);
}

/**
 * Parse the raw JSON-RPC response and validate the artifact payload against
 * its runtime schema. Throws JsonRpcError for RPC-level errors and
 * VpResponseValidationError for malformed or incomplete artifact data.
 *
 * Payloads above ERROR_RESPONSE_SIZE_THRESHOLD cannot be parsed on the main
 * thread - a ~450 MB payload would exceed V8's max string length or freeze
 * the tab - so they are validated structurally via their envelope prefix
 * (see validateLargePayloadEnvelopePrefix) instead of being passed through
 * unchecked.
 */
function validateArtifactPayload(buffer: ArrayBuffer): void {
  if (buffer.byteLength >= ERROR_RESPONSE_SIZE_THRESHOLD) {
    validateLargePayloadEnvelopePrefix(buffer);
    return;
  }

  const text = new TextDecoder("utf-8").decode(buffer);

  let envelope: unknown;
  try {
    envelope = JSON.parse(text);
  } catch {
    throw new VpResponseValidationError(
      "Artifact response body is not valid JSON",
    );
  }

  if (
    envelope === null ||
    typeof envelope !== "object" ||
    Array.isArray(envelope)
  ) {
    throw new VpResponseValidationError(
      "Artifact response envelope is not a JSON object",
    );
  }

  const record = envelope as Record<string, unknown>;

  if ("error" in record && record.error != null) {
    const err = record.error as Record<string, unknown>;
    const code =
      typeof err.code === "number"
        ? err.code
        : JSON_RPC_ERROR_CODES.INVALID_RESPONSE;
    const message =
      typeof err.message === "string" ? err.message : "Unknown RPC error";
    throw new JsonRpcError(code, message, "wire", err.data);
  }

  if (!("result" in record)) {
    throw new VpResponseValidationError(
      "Artifact response envelope is missing the result field",
    );
  }

  validateRequestDepositorClaimerArtifactsResponse(record.result);
}

/**
 * Structural validation for payloads too large to parse on the main thread.
 * Decodes only the envelope prefix and rejects anything that isn't a JSON-RPC
 * success envelope: non-JSON garbage, or an error envelope padded past
 * ERROR_RESPONSE_SIZE_THRESHOLD to slip past the parsed small-response path.
 *
 * This does NOT prove the (unparsed) artifact body is well-formed - a VP that
 * returns a success-shaped envelope wrapping a corrupt artifact still passes.
 * Validating the body itself needs the deferred streaming/verification work.
 */
function validateLargePayloadEnvelopePrefix(buffer: ArrayBuffer): void {
  const slice =
    buffer.byteLength > PREFIX_VALIDATION_BYTES
      ? buffer.slice(0, PREFIX_VALIDATION_BYTES)
      : buffer;
  // Default (non-fatal) decoding tolerates a multi-byte char clipped at the
  // slice boundary rather than throwing.
  const prefix = new TextDecoder("utf-8").decode(slice);

  if (!prefix.trimStart().startsWith("{")) {
    throw new VpResponseValidationError(
      "Artifact response is not a JSON object",
    );
  }

  const resultIdx = prefix.search(/"result"\s*:/);
  const errorIdx = prefix.search(/"error"\s*:/);

  // An error envelope - possibly padded past the size threshold to dodge the
  // parsed small-response path - must never be treated as a successful
  // download. The VP serializes the top-level `result`/`error` key before the
  // large artifact value, so a top-level error key appears ahead of `result`.
  if (errorIdx !== -1 && (resultIdx === -1 || errorIdx < resultIdx)) {
    throw new VpResponseValidationError(
      "Artifact response is a JSON-RPC error envelope, not artifact data",
    );
  }

  if (resultIdx === -1) {
    throw new VpResponseValidationError(
      "Artifact response envelope is missing the result field",
    );
  }
}

/**
 * Trigger a browser file download from a Blob.
 */
function triggerBlobDownload(blob: Blob, peginTxid: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `babylon-vault-artifacts-${stripHexPrefix(peginTxid).slice(0, 8)}.json`;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}
