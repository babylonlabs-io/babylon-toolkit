/**
 * Service for fetching and downloading BaBe Decryptor artifacts.
 *
 * These artifacts are required for the depositor to independently claim
 * their vault funds. They are retrieved from the vault provider after
 * the WOTS key has been submitted and the vault is fully set up.
 *
 * Artifacts can be very large (~1 GB today). The raw response body is
 * retained as a Blob so the download step does not need to re-serialize
 * it, and payloads above an RPC-error-sized threshold are not parsed on
 * the main thread (doing so would risk exceeding V8's string length limit
 * or freezing the tab). Full schema validation of the artifact body is
 * deferred until the backend delivers artifacts via streaming; for now
 * small responses (expected to be JSON-RPC error envelopes) are parsed and
 * validated, and large responses are structurally checked via their
 * JSON-RPC envelope prefix.
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
 * Error responses are typically small; artifact payloads can be around a
 * gigabyte. Only responses under this threshold are parsed on the main thread.
 */
const ERROR_RESPONSE_SIZE_THRESHOLD = 4096;

/** MIME type for the assembled artifact Blob (the payload is JSON). */
const ARTIFACT_BLOB_TYPE = "application/json";

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
  /**
   * Aborts the underlying request (threaded into `callRaw` → `fetch`).
   * Unlike `isCancelled`, which is only polled *between* chunk reads, this
   * unblocks a `reader.read()` stalled on a silent connection, so Cancel
   * releases the socket immediately instead of hanging until the next byte,
   * EOF, or the RPC timeout.
   */
  signal?: AbortSignal;
}

/**
 * Sentinel thrown when the caller cancels the download via
 * `FetchArtifactsOptions.isCancelled` or `FetchArtifactsOptions.signal`.
 * Callers should swallow this instead of surfacing it as an error.
 */
export class ArtifactDownloadCancelledError extends Error {
  constructor() {
    super("Artifact download was cancelled");
    this.name = "ArtifactDownloadCancelledError";
  }
}

/**
 * How many leading bytes of a large response we decode to structurally check
 * its JSON-RPC envelope. A genuine success envelope's top-level keys
 * (`jsonrpc`, `id`, `result`) plus separators occupy well under a hundred
 * bytes before the huge artifact value begins, so 64 KiB gives roughly three
 * orders of magnitude of headroom for benign variation (pretty-printing,
 * extra metadata fields) while staying a trivial allocation. An envelope
 * whose top-level `result` key sits past this bound is not a plausible
 * honest response and is rejected fail-closed.
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

  let body: ReadBodyResult;
  try {
    const response = await client.callRaw(
      "vaultProvider_requestDepositorClaimerArtifacts",
      {
        pegin_txid: normalizedPeginTxid,
        depositor_pk: stripHexPrefix(depositorPk),
      },
      options?.signal,
    );

    body = await readBodyWithProgress(response, options);
  } catch (err) {
    // A cancellation can surface here as our own sentinel, the client's
    // "Request aborted", or a DOM AbortError. Normalize all of them to the
    // sentinel so the caller's catch swallows the cancel instead of
    // rendering it as a download failure.
    if (err instanceof ArtifactDownloadCancelledError) throw err;
    if (options?.signal?.aborted || options?.isCancelled?.()) {
      throw new ArtifactDownloadCancelledError();
    }
    throw err;
  }

  // Validation runs outside the cancel-normalizing catch above so a genuine
  // payload error still surfaces as VpResponseValidationError / JsonRpcError.
  validateArtifactPayload(body.validationBytes, body.byteLength);

  triggerBlobDownload(body.blob, peginTxid);
}

interface ReadBodyResult {
  /** The full payload, assembled without an intermediate contiguous copy. */
  blob: Blob;
  /** Exact number of bytes received. */
  byteLength: number;
  /**
   * Contiguous bytes for validation: the full body for sub-threshold
   * payloads (see ERROR_RESPONSE_SIZE_THRESHOLD), or only the leading
   * PREFIX_VALIDATION_BYTES for real (large) artifact payloads, which are
   * never fully decoded on the main thread — the prefix is enough for the
   * envelope check and skips the extra full-size allocation on that path.
   */
  validationBytes: Uint8Array;
}

/**
 * Stream the response body so the UI can show a real byte-level progress
 * bar, assembling the chunks straight into a Blob. Building the Blob from
 * the chunk array avoids allocating a second full-size contiguous buffer
 * (and the copy loop that fills it) — material on the ~1 GB path, where the
 * old chunks + merged-buffer + Blob sequence held three full copies live at
 * once. Falls back to `Response.arrayBuffer()` when the body is not a
 * ReadableStream (e.g. some test doubles).
 *
 * Returns the assembled Blob plus its exact byte length, and a contiguous
 * byte copy for validation: the full body for sub-threshold payloads, only
 * the leading PREFIX_VALIDATION_BYTES for large ones.
 */
async function readBodyWithProgress(
  response: Response,
  options: FetchArtifactsOptions | undefined,
): Promise<ReadBodyResult> {
  const contentLengthHeader = response.headers.get("content-length");
  const headerTotal = contentLengthHeader ? Number(contentLengthHeader) : NaN;
  const totalBytes =
    Number.isFinite(headerTotal) && headerTotal > 0
      ? headerTotal
      : ARTIFACT_TOTAL_FALLBACK_BYTES;

  if (!response.body) {
    if (options?.isCancelled?.()) {
      throw new ArtifactDownloadCancelledError();
    }
    const buffer = await response.arrayBuffer();
    options?.onProgress?.(buffer.byteLength, totalBytes);
    return {
      blob: new Blob([buffer], { type: ARTIFACT_BLOB_TYPE }),
      byteLength: buffer.byteLength,
      validationBytes: new Uint8Array(
        buffer,
        0,
        Math.min(buffer.byteLength, PREFIX_VALIDATION_BYTES),
      ),
    };
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array<ArrayBuffer>[] = [];
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

  // Small payloads need their full body for parsing; large artifact payloads
  // only need the leading PREFIX_VALIDATION_BYTES for the envelope check
  // (ERROR_RESPONSE_SIZE_THRESHOLD < PREFIX_VALIDATION_BYTES, so one bound
  // covers both), keeping the copy far below full payload size on that path.
  const validationLength = Math.min(received, PREFIX_VALIDATION_BYTES);
  const validationBytes = new Uint8Array(validationLength);
  let offset = 0;
  for (const chunk of chunks) {
    if (offset >= validationLength) break;
    const remaining = validationLength - offset;
    const source =
      chunk.byteLength > remaining ? chunk.subarray(0, remaining) : chunk;
    validationBytes.set(source, offset);
    offset += source.byteLength;
  }

  return {
    blob: new Blob(chunks, { type: ARTIFACT_BLOB_TYPE }),
    byteLength: received,
    validationBytes,
  };
}

/**
 * Parse the raw JSON-RPC response and validate the artifact payload against
 * its runtime schema. Throws JsonRpcError for RPC-level errors and
 * VpResponseValidationError for malformed or incomplete artifact data.
 *
 * Payloads at or above ERROR_RESPONSE_SIZE_THRESHOLD cannot be parsed on the
 * main thread - turning a ~1 GB payload into a string would exceed V8's max
 * string length or freeze the tab - so they are validated structurally via
 * their envelope prefix (see validateLargePayloadEnvelopePrefix) instead of
 * being passed through unchecked. For those, `validationBytes` holds only
 * the leading PREFIX_VALIDATION_BYTES of the body.
 */
function validateArtifactPayload(
  validationBytes: Uint8Array,
  byteLength: number,
): void {
  if (byteLength >= ERROR_RESPONSE_SIZE_THRESHOLD) {
    validateLargePayloadEnvelopePrefix(validationBytes);
    return;
  }

  const text = new TextDecoder("utf-8").decode(validationBytes);

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
 * The prefix is scanned with a depth-aware tokenizer so only keys of the
 * top-level envelope object count — `"result"`/`"error"` text nested inside
 * the artifact body cannot flip the verdict, and key order is irrelevant.
 * The verdict mirrors the parsed small-response path: any non-null top-level
 * `error` rejects (even alongside a `result` key), and a top-level `result`
 * that is absent from the prefix rejects fail-closed.
 *
 * This does NOT prove the (unparsed) artifact body is well-formed - a VP that
 * returns a success-shaped envelope wrapping a corrupt artifact still passes.
 * Validating the body itself needs the deferred streaming/verification work.
 */
function validateLargePayloadEnvelopePrefix(bytes: Uint8Array): void {
  const slice =
    bytes.byteLength > PREFIX_VALIDATION_BYTES
      ? bytes.subarray(0, PREFIX_VALIDATION_BYTES)
      : bytes;
  // Default (non-fatal) decoding tolerates a multi-byte char clipped at the
  // slice boundary rather than throwing.
  const prefix = new TextDecoder("utf-8").decode(slice);

  const scan = scanEnvelopePrefix(prefix);

  if (!scan.isJsonObject) {
    throw new VpResponseValidationError(
      "Artifact response is not a JSON object",
    );
  }

  if (scan.hasNonNullTopLevelError) {
    throw new VpResponseValidationError(
      "Artifact response is a JSON-RPC error envelope, not artifact data",
    );
  }

  if (!scan.hasTopLevelResult) {
    throw new VpResponseValidationError(
      "Artifact response envelope is missing the result field",
    );
  }
}

/** JSON whitespace per RFC 8259: space, tab, line feed, carriage return. */
const JSON_WHITESPACE = new Set([" ", "\t", "\n", "\r"]);

interface EnvelopePrefixScan {
  /** The first non-whitespace character opens a JSON object. */
  isJsonObject: boolean;
  /** The top-level object declares a `result` key within the prefix. */
  hasTopLevelResult: boolean;
  /**
   * The top-level object declares an `error` key whose value is anything
   * other than the literal `null` — the same condition the parsed
   * small-response path treats as an error envelope.
   */
  hasNonNullTopLevelError: boolean;
}

/**
 * Structurally scan a (possibly truncated) JSON document prefix for the
 * top-level `result`/`error` keys. Tracks string/escape state and nesting
 * depth instead of substring matching, so occurrences nested inside values
 * are ignored. Truncation is safe: keys seen before the cut are reliable,
 * and anything cut off simply stays unreported (callers treat missing
 * `result` as a rejection, so truncation fails closed).
 */
function scanEnvelopePrefix(prefix: string): EnvelopePrefixScan {
  const scan: EnvelopePrefixScan = {
    isJsonObject: false,
    hasTopLevelResult: false,
    hasNonNullTopLevelError: false,
  };

  const start = skipJsonWhitespace(prefix, 0);
  if (prefix[start] !== "{") {
    return scan;
  }
  scan.isJsonObject = true;

  let depth = 0;
  let inString = false;
  let escaped = false;
  let stringValue = "";
  let stringDepth = 0;

  for (let index = start; index < prefix.length; index++) {
    const char = prefix[index];

    if (inString) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (char === "\\") {
        escaped = true;
        continue;
      }
      if (char !== '"') {
        stringValue += char;
        continue;
      }
      inString = false;
      if (stringDepth !== 1) {
        continue;
      }
      // A string directly inside the top-level object is a key only when
      // followed by a colon; otherwise it is a top-level value string.
      const colonIndex = skipJsonWhitespace(prefix, index + 1);
      if (prefix[colonIndex] !== ":") {
        continue;
      }
      if (stringValue === "result") {
        scan.hasTopLevelResult = true;
      }
      if (
        stringValue === "error" &&
        !isNullLiteral(prefix, skipJsonWhitespace(prefix, colonIndex + 1))
      ) {
        scan.hasNonNullTopLevelError = true;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
      escaped = false;
      stringValue = "";
      stringDepth = depth;
    } else if (char === "{" || char === "[") {
      depth++;
    } else if (char === "}" || char === "]") {
      depth--;
    }
  }

  return scan;
}

function skipJsonWhitespace(text: string, from: number): number {
  let index = from;
  while (index < text.length && JSON_WHITESPACE.has(text[index])) {
    index++;
  }
  return index;
}

/**
 * True when `text` holds the JSON literal `null` at `from`, i.e. followed by
 * a value delimiter or the end of the (truncated) prefix. A truncated
 * `null` reads as non-null, which fails closed on the error-envelope check.
 */
function isNullLiteral(text: string, from: number): boolean {
  if (!text.startsWith("null", from)) {
    return false;
  }
  const next = text[from + "null".length];
  return (
    next === undefined ||
    next === "," ||
    next === "}" ||
    JSON_WHITESPACE.has(next)
  );
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
