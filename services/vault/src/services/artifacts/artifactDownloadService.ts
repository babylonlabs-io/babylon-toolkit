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

/** Options for {@link fetchAndDownloadArtifacts}. */
export interface FetchArtifactsOptions {
  /** Aborts the request/stream (e.g. the user cancels the download). */
  signal?: AbortSignal;
  /**
   * Byte-level progress, reported per received chunk. `totalBytes` is the
   * Content-Length header value and 0 when the header is absent; with a
   * compressed transfer it reflects wire bytes while chunks are decoded
   * bytes, so `receivedBytes` can exceed it — display layers must clamp.
   */
  onProgress?: (receivedBytes: number, totalBytes: number) => void;
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
 * @param options         - Optional abort signal and byte-progress callback.
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
    options?.signal,
  );

  const buffer = await readBodyWithProgress(response, options);

  // Covers an abort that lands after the last chunk (or on the
  // arrayBuffer() fallback path): a cancelled download must never reach
  // the file save.
  if (options?.signal?.aborted) {
    throw newAbortError();
  }

  const blob = new Blob([buffer], { type: "application/json" });

  validateArtifactPayload(buffer);

  triggerBlobDownload(blob, peginTxid);
}

function newAbortError(): DOMException {
  return new DOMException("Artifact download was cancelled", "AbortError");
}

/**
 * Read the response body chunk-by-chunk so byte progress can be reported
 * while the (potentially very large) payload streams in. Falls back to a
 * single arrayBuffer() read when no progress listener is registered or the
 * environment exposes no body stream.
 *
 * The abort signal must be honored HERE: JsonRpcClient detaches the caller
 * signal from the fetch as soon as response headers arrive, so an abort
 * during the (potentially minutes-long) body stream would otherwise be
 * silently ignored and the transfer would run to completion. Each read is
 * raced against the signal and the reader is cancelled on abort so the
 * connection is actually released.
 */
async function readBodyWithProgress(
  response: Response,
  options?: FetchArtifactsOptions,
): Promise<ArrayBuffer> {
  const signal = options?.signal;
  const onProgress = options?.onProgress;
  if (!onProgress || !response.body) {
    return response.arrayBuffer();
  }

  const contentLength = Number(response.headers.get("content-length"));
  const totalBytes =
    Number.isFinite(contentLength) && contentLength > 0 ? contentLength : 0;

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let receivedBytes = 0;

  let onAbort: (() => void) | undefined;
  const abortPromise = signal
    ? new Promise<never>((_, reject) => {
        onAbort = () => reject(newAbortError());
        if (signal.aborted) onAbort();
        else signal.addEventListener("abort", onAbort, { once: true });
      })
    : null;
  // Observe the rejection eagerly so an abort firing outside a race (e.g.
  // right after the final chunk) can't surface as an unhandled rejection.
  abortPromise?.catch(() => undefined);

  try {
    while (true) {
      const { done, value } = abortPromise
        ? await Promise.race([reader.read(), abortPromise])
        : await reader.read();
      if (done) break;
      chunks.push(value);
      receivedBytes += value.byteLength;
      onProgress(receivedBytes, totalBytes);
    }
  } catch (err) {
    // Release the connection; the abort (or read failure) being rethrown is
    // the primary error, so a cancel() failure here carries no extra signal.
    await reader.cancel().catch(() => undefined);
    throw err;
  } finally {
    if (signal && onAbort) signal.removeEventListener("abort", onAbort);
  }

  const merged = new Uint8Array(receivedBytes);
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
