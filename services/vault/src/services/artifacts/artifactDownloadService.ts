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
 * Fallback total used by the progress bar when the server omits
 * Content-Length. Artifact payloads are currently ~1 GB; 1.3 GB leaves
 * comfortable headroom so the displayed percentage stays under 100% for
 * a typical response.
 */
const ARTIFACT_TOTAL_FALLBACK_BYTES = 1_395_864_371;

export interface FetchArtifactsOptions {
  /**
   * Invoked after each chunk read from the response body. `totalBytes`
   * comes from Content-Length when present, otherwise falls back to a
   * fixed estimate (the server does not always send a length header).
   */
  onProgress?: (receivedBytes: number, totalBytes: number) => void;
  /**
   * Polled between chunk reads. Returning true cancels the in-flight
   * stream — used so the modal's Cancel path actually releases the
   * connection instead of pulling bytes in the background.
   */
  isCancelled?: () => boolean;
}

/**
 * Sentinel thrown when the caller cancels the download via
 * `FetchArtifactsOptions.isCancelled`. Callers should swallow this
 * instead of surfacing it as an error.
 */
export class ArtifactDownloadCancelledError extends Error {
  constructor() {
    super("Artifact download was cancelled");
    this.name = "ArtifactDownloadCancelledError";
  }
}

/**
 * Fetch artifacts from the vault provider and trigger a browser file download.
 *
 * Uses JsonRpcClient.callRaw() so the raw response body can be preserved
 * as a Blob for download without a separate re-serialization pass. The
 * payload is parsed once for schema validation and the download is only
 * triggered after validation succeeds.
 *
 * @param providerAddress - Vault provider's Ethereum address.
 * @param peginTxid       - Bitcoin pegin transaction ID (hex, with or without 0x prefix).
 * @param depositorPk     - Depositor's Bitcoin public key.
 */
export async function fetchAndDownloadArtifacts(
  providerAddress: string,
  peginTxid: string,
  depositorPk: string,
  options?: FetchArtifactsOptions,
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

  const buffer = await readBodyWithProgress(response, options);
  const blob = new Blob([buffer], { type: "application/json" });

  validateArtifactPayload(buffer);

  triggerBlobDownload(blob, peginTxid);
}

/**
 * Stream the response body so the UI can show a real byte-level progress
 * bar. Falls back to `Response.arrayBuffer()` when the body is not a
 * ReadableStream (e.g. some test doubles).
 */
async function readBodyWithProgress(
  response: Response,
  options: FetchArtifactsOptions | undefined,
): Promise<ArrayBuffer> {
  const contentLengthHeader = response.headers.get("content-length");
  const headerTotal = contentLengthHeader ? Number(contentLengthHeader) : NaN;
  const totalBytes =
    Number.isFinite(headerTotal) && headerTotal > 0
      ? headerTotal
      : ARTIFACT_TOTAL_FALLBACK_BYTES;

  if (!response.body) {
    const buffer = await response.arrayBuffer();
    options?.onProgress?.(buffer.byteLength, totalBytes);
    return buffer;
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;

  options?.onProgress?.(0, totalBytes);

  try {
    while (true) {
      if (options?.isCancelled?.()) {
        await reader.cancel().catch(() => undefined);
        throw new ArtifactDownloadCancelledError();
      }
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        chunks.push(value);
        received += value.byteLength;
        options?.onProgress?.(received, totalBytes);
      }
    }
  } finally {
    reader.releaseLock();
  }

  const merged = new Uint8Array(received);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return merged.buffer;
}

/**
 * Parse the raw JSON-RPC response and validate the artifact payload against
 * its runtime schema. Throws JsonRpcError for RPC-level errors and
 * VpResponseValidationError for malformed or incomplete artifact data.
 *
 * Payloads above ERROR_RESPONSE_SIZE_THRESHOLD are assumed to be real
 * artifact responses and are passed through without parsing - parsing a
 * ~450 MB payload on the main thread would likely exceed V8's string
 * length limit or freeze the tab.
 */
function validateArtifactPayload(buffer: ArrayBuffer): void {
  if (buffer.byteLength >= ERROR_RESPONSE_SIZE_THRESHOLD) {
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
