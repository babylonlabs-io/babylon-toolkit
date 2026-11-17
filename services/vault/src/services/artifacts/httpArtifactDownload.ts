/**
 * Fetch the manifest, validate it, and download each CBOR session checked
 * against its SHA-256 ETag with Range/If-Range resume.
 */

import {
  AUTH_REJECTED_RPC_CODE,
  JsonRpcError,
  VpResponseValidationError,
} from "@babylonlabs-io/ts-sdk/tbv/core/clients";
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex } from "@noble/hashes/utils.js";

import { COPY } from "@/copy";
import { combineAbortSignals } from "@/utils/async";

import { sortSessionKeys } from "./claimFile";

/** Largest original session the VP serves. */
const MAX_SESSION_BYTES = 256 * 1024 * 1024;

/**
 * Smallest session that can be recovery material: charset and shape alone
 * would accept a token payload, and it would earn a download receipt.
 */
const MIN_SESSION_BYTES = 32 * 1024;

/** Largest manifest the VP serves (its `MAX_MANIFEST_BYTES`). */
const MAX_MANIFEST_BYTES = 64 * 1024 * 1024;

/** Serialized TxGraph ceiling; a measured 8-challenger graph is 1.79 MB. */
const MAX_TX_GRAPH_JSON_BYTES = 32 * 1024 * 1024;

/** Verifying key ceiling; the measured ark-serialized key is 528 hex chars. */
const MAX_VERIFYING_KEY_HEX_BYTES = 64 * 1024;

/** Challenger-count ceiling, so a session map cannot be a memory sink. */
export const MAX_SESSIONS = 1024;

/** Transfer attempts per file: network failures and broken bodies. */
const MAX_ATTEMPTS = 8;

/** Upper bound for retry waits when Retry-After is absent. */
const MAX_RETRY_DELAY_MS = 30_000;

/** Total wait per file for busy responses, separate from transfer attempts. */
const MAX_BUSY_WAIT_MS = 5 * 60_000;

/**
 * Longest wait for a response's headers. Replaces the JSON-RPC
 * `RPC_TIMEOUT_MS` bound the artifact path lost when it moved to HTTP. The
 * body is never bounded: a 256 MiB session legitimately outlives any bound.
 */
const ARTIFACT_HEADER_TIMEOUT_MS = 120_000;

/** Responses that a later request can succeed after. */
const RETRYABLE_STATUSES = new Set([408, 429, 500, 502, 503, 504]);

const HEX32_RE = /^[0-9a-f]{64}$/;

/** Non-empty, even-length, lowercase hex. */
const HEX_BYTES_RE = /^(?:[0-9a-f]{2})+$/;

/** A strong ETag that holds a lowercase SHA-256 hex digest. */
const SHA256_ETAG_RE = /^"([0-9a-f]{64})"$/;

const CONTENT_RANGE_RE = /^bytes (\d+)-(\d+)\/(\d+)$/;

export type FetchLike = typeof fetch;

/**
 * The VP answers 409 while the peg-in is not yet eligible or its artifacts
 * are not finished. The download hook waits and retries on this error.
 */
export class ArtifactsNotReadyError extends Error {
  /**
   * True for `INVALID_STATE`: the peg-in is in no status that retains the
   * package. The VP does not say which status it is, so this also covers a
   * terminal status, and the hook bounds the wait.
   */
  readonly invalidState: boolean;

  constructor(invalidState: boolean) {
    super("Vault provider artifacts are not ready yet");
    this.name = "ArtifactsNotReadyError";
    this.invalidState = invalidState;
  }
}

export interface ManifestSession {
  /** Challenger x-only key, 64 lowercase hex. */
  key: string;
  url: string;
  byteLength: number;
}

export interface RecoveryKitManifest {
  txGraphJson: string;
  verifyingKeyHex: string;
  /** `txGraphJson` parsed, proven to be a non-array object. */
  txGraph: Record<string, unknown>;
  /** Insertion order is ascending bytewise key order. */
  sessions: Map<string, ManifestSession>;
}

export interface DownloadedSession {
  /** The reader's own chunks, each over its own ArrayBuffer. */
  chunks: Uint8Array<ArrayBuffer>[];
  /** Lowercase hex, equal to the ETag the VP served. */
  sha256: string;
}

/**
 * Fetch and validate the deposit's manifest.
 *
 * @param artifactsBaseUrl - `${VP_PROXY_URL}/artifacts/${vpAddress}`.
 * @param peginTxid        - Pegin txid, hex without `0x`.
 * @param getToken         - Returns the JSON-RPC-subject bearer, or null
 *                           when none is cached (the VP then answers 401).
 */
export async function fetchRecoveryKitManifest(
  artifactsBaseUrl: string,
  peginTxid: string,
  getToken: () => Promise<string | null>,
  signal: AbortSignal | undefined,
  fetchImpl: FetchLike,
): Promise<RecoveryKitManifest> {
  const txid = peginTxid.toLowerCase();
  const baseUrl = `${artifactsBaseUrl}/${txid}`;
  return parseManifest(
    await fetchManifest(`${baseUrl}/manifest`, getToken, signal, fetchImpl),
    baseUrl,
    txid,
  );
}

async function fetchManifest(
  url: string,
  getToken: () => Promise<string | null>,
  signal: AbortSignal | undefined,
  fetchImpl: FetchLike,
): Promise<unknown> {
  const busy = { retries: 0, waitedMs: 0 };
  for (let attempt = 0; ; ) {
    let fetched: TokenFetch;
    try {
      fetched = await fetchWithToken(url, getToken, {}, signal, fetchImpl);
    } catch (err) {
      if (!isNetworkError(err, signal)) throw err;
      if (++attempt >= MAX_ATTEMPTS) {
        // A transport failure, not a validation failure.
        throw new Error(
          COPY.deposit.recoveryArtifacts.transferRetriesExhausted(MAX_ATTEMPTS),
          { cause: err },
        );
      }
      await sleep(backoffMs(attempt - 1), signal);
      continue;
    }
    const { response, release } = fetched;
    try {
      if (await waitIfBusy(response, busy, signal)) continue;
      if (response.status !== 200) throw await httpError(response);
      const length = Number(response.headers.get("content-length"));
      if (!(length > 0 && length <= MAX_MANIFEST_BYTES)) {
        await response.body?.cancel();
        throw new VpResponseValidationError(
          "Artifact manifest has no valid Content-Length",
        );
      }
      return await readManifestJson(response, length, signal);
    } finally {
      release();
    }
  }
}

/**
 * Read the body through a byte-counting reader so a body longer than its
 * declared length (already checked against the cap) is refused before parse.
 */
async function readManifestJson(
  response: Response,
  declaredLength: number,
  signal: AbortSignal | undefined,
): Promise<unknown> {
  const chunks: Uint8Array[] = [];
  let received = 0;
  try {
    for await (const chunk of readChunks(response)) {
      received += chunk.byteLength;
      if (received > declaredLength) {
        throw new VpResponseValidationError(
          "Artifact manifest is longer than its Content-Length",
        );
      }
      chunks.push(chunk);
    }
  } catch (err) {
    if (signal?.aborted || err instanceof VpResponseValidationError) {
      throw err;
    }
    throw new VpResponseValidationError("Artifact manifest could not be read");
  }
  const body = new Uint8Array(received);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return JSON.parse(new TextDecoder().decode(body));
  } catch {
    throw new VpResponseValidationError("Artifact manifest is not JSON");
  }
}

function parseManifest(
  raw: unknown,
  baseUrl: string,
  txid: string,
): RecoveryKitManifest {
  const invalid = (detail: string) =>
    new VpResponseValidationError(`Invalid artifact manifest: ${detail}`);
  if (typeof raw !== "object" || raw === null) throw invalid("not an object");
  const { tx_graph_json, verifying_key_hex, babe_sessions } = raw as Record<
    string,
    unknown
  >;
  if (typeof tx_graph_json !== "string") throw invalid("tx_graph_json");
  if (typeof verifying_key_hex !== "string") {
    throw invalid("verifying_key_hex");
  }
  if (typeof babe_sessions !== "object" || babe_sessions === null) {
    throw invalid("babe_sessions");
  }

  const txGraphBytes = new TextEncoder().encode(tx_graph_json).byteLength;
  if (txGraphBytes === 0 || txGraphBytes > MAX_TX_GRAPH_JSON_BYTES) {
    throw invalid("tx_graph_json length");
  }
  const txGraph = parseTxGraphJson(tx_graph_json);

  // Hex is ASCII, so once the charset holds the string length is the byte length.
  if (
    !HEX_BYTES_RE.test(verifying_key_hex) ||
    verifying_key_hex.length > MAX_VERIFYING_KEY_HEX_BYTES
  ) {
    throw invalid("verifying_key_hex");
  }

  const keys = Object.keys(babe_sessions);
  if (keys.length === 0 || keys.length > MAX_SESSIONS) {
    throw invalid(`${keys.length} sessions`);
  }
  const entries = babe_sessions as Record<string, unknown>;
  const sessions = new Map<string, ManifestSession>();
  for (const key of sortSessionKeys(keys)) {
    if (!HEX32_RE.test(key)) throw invalid(`challenger key ${key}`);
    const { download_path, byte_length } = (entries[key] ?? {}) as Record<
      string,
      unknown
    >;
    // The path is not followed: the proxy route is built from the key, so
    // a manifest cannot point the bearer at another path.
    if (download_path !== `/v1/depositor-artifacts/${txid}/sessions/${key}`) {
      throw invalid(`download_path for ${key}`);
    }
    if (
      typeof byte_length !== "number" ||
      !Number.isSafeInteger(byte_length) ||
      byte_length < MIN_SESSION_BYTES ||
      byte_length > MAX_SESSION_BYTES
    ) {
      throw invalid(`byte_length for ${key}`);
    }
    sessions.set(key, {
      key,
      url: `${baseUrl}/sessions/${key}`,
      byteLength: byte_length,
    });
  }
  return {
    txGraphJson: tx_graph_json,
    verifyingKeyHex: verifying_key_hex,
    txGraph,
    sessions,
  };
}

/**
 * `tx_graph_json` carries a JSON document as a string. Its schema is owned by
 * the Rust side, so the only structural claim made here is that it parses to
 * an object rather than arbitrary text.
 */
function parseTxGraphJson(raw: string): Record<string, unknown> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new VpResponseValidationError(
      "Artifact manifest tx_graph_json is not valid JSON",
    );
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new VpResponseValidationError(
      "Artifact manifest tx_graph_json is not a JSON object",
    );
  }
  return parsed as Record<string, unknown>;
}

/**
 * Download one session, resuming after a broken transfer. Returns the
 * chunks only after their SHA-256 matches the ETag. An abort of `signal`
 * is rethrown, never retried.
 *
 * @param onBytes - Called after every chunk with the bytes received so far
 *                  for this session; restarts when a 200 replaces a partial
 *                  transfer.
 */
export async function downloadRecoveryKitSession(
  session: ManifestSession,
  getToken: () => Promise<string | null>,
  signal: AbortSignal | undefined,
  fetchImpl: FetchLike,
  onBytes?: (received: number) => void,
): Promise<DownloadedSession> {
  let chunks: Uint8Array<ArrayBuffer>[] = [];
  let received = 0;
  let etag: string | null = null;
  let hasher = sha256.create();
  let lastError: unknown = null;
  const busy = { retries: 0, waitedMs: 0 };
  let attempt = 0;
  // Wait before the next transfer attempt, but not after the last one.
  const nextAttempt = async () => {
    if (++attempt < MAX_ATTEMPTS) await sleep(backoffMs(attempt - 1), signal);
  };

  while (attempt < MAX_ATTEMPTS) {
    const headers: Record<string, string> =
      etag !== null && received > 0
        ? { Range: `bytes=${received}-`, "If-Range": etag }
        : {};
    let fetched: TokenFetch;
    try {
      fetched = await fetchWithToken(
        session.url,
        getToken,
        headers,
        signal,
        fetchImpl,
      );
    } catch (err) {
      if (!isNetworkError(err, signal)) throw err;
      lastError = err;
      await nextAttempt();
      continue;
    }
    const { response, release } = fetched;

    try {
      if (await waitIfBusy(response, busy, signal)) continue;

      const current = response.headers.get("etag");
      if (current === null || !SHA256_ETAG_RE.test(current)) {
        if (response.status === 200 || response.status === 206) {
          await response.body?.cancel();
          throw new VpResponseValidationError(
            "Artifact session has no SHA-256 ETag",
          );
        }
        throw await httpError(response);
      }

      let end: number;
      if (response.status === 200) {
        // A full response replaces any partial bytes, even with the same ETag.
        chunks = [];
        received = 0;
        hasher = sha256.create();
        etag = current;
        end = session.byteLength;
        onBytes?.(received);
      } else if (response.status === 206 && received > 0) {
        const range = CONTENT_RANGE_RE.exec(
          response.headers.get("content-range") ?? "",
        );
        end = range ? Number(range[2]) + 1 : 0;
        if (
          current !== etag ||
          !range ||
          Number(range[1]) !== received ||
          Number(range[3]) !== session.byteLength ||
          end <= received ||
          end > session.byteLength
        ) {
          await response.body?.cancel();
          throw new VpResponseValidationError(
            "Resumed artifact session does not match the first response",
          );
        }
      } else {
        await response.body?.cancel();
        throw new VpResponseValidationError(
          `Unexpected artifact session status ${response.status}`,
        );
      }
      if (Number(response.headers.get("content-length")) !== end - received) {
        await response.body?.cancel();
        throw new VpResponseValidationError(
          "Artifact session length does not match the manifest",
        );
      }

      try {
        for await (const chunk of readChunks(response)) {
          if (received + chunk.byteLength > end) {
            throw new VpResponseValidationError(
              "Artifact session is longer than the manifest",
            );
          }
          chunks.push(chunk);
          hasher.update(chunk);
          received += chunk.byteLength;
          onBytes?.(received);
        }
      } catch (err) {
        if (signal?.aborted || err instanceof VpResponseValidationError) {
          throw err;
        }
        // Keep the bytes received so far; the next attempt resumes after them.
        lastError = err;
      }

      if (received === session.byteLength) {
        const digest = bytesToHex(hasher.digest());
        if (`"${digest}"` !== etag) {
          throw new VpResponseValidationError(
            "Artifact session bytes do not match their ETag",
          );
        }
        return { chunks, sha256: digest };
      }
    } finally {
      release();
    }
    await nextAttempt();
  }
  // A transport failure, not a validation failure: the bytes were never wrong.
  throw new Error(
    COPY.deposit.recoveryArtifacts.transferRetriesExhausted(MAX_ATTEMPTS),
    lastError === null ? undefined : { cause: lastError },
  );
}

/** `fetch` rejects with a TypeError on a network failure. */
function isNetworkError(err: unknown, signal: AbortSignal | undefined) {
  return err instanceof TypeError && !signal?.aborted;
}

interface TokenFetch {
  response: Response;
  /** Detach the request's signal listeners once its body is done or cancelled. */
  release: () => void;
}

/**
 * Send one authenticated request, waiting at most
 * `ARTIFACT_HEADER_TIMEOUT_MS` for its headers. A fired bound is rethrown as
 * a TypeError so the attempt loops treat it as a transport failure; an abort
 * of `signal` is rethrown unchanged.
 */
async function fetchWithToken(
  url: string,
  getToken: () => Promise<string | null>,
  headers: Record<string, string>,
  signal: AbortSignal | undefined,
  fetchImpl: FetchLike,
): Promise<TokenFetch> {
  const token = await getToken();
  const bound = new AbortController();
  // Composed with the app's helper: `AbortSignal.any` is missing on
  // Safari < 17.4 and Chrome < 116.
  const composed = combineAbortSignals(
    signal ? [signal, bound.signal] : [bound.signal],
  );
  const timer = setTimeout(() => bound.abort(), ARTIFACT_HEADER_TIMEOUT_MS);
  // Reject the header wait on abort directly as well, so the bound does not
  // depend on the fetch implementation observing the signal.
  let onAbort: (() => void) | undefined;
  const aborted = new Promise<never>((_resolve, reject) => {
    onAbort = () => reject(composed.signal.reason);
    if (composed.signal.aborted) {
      onAbort();
      return;
    }
    composed.signal.addEventListener("abort", onAbort, { once: true });
  });
  let response: Response;
  try {
    response = await Promise.race([
      fetchImpl(url, {
        headers: token
          ? { ...headers, Authorization: `Bearer ${token}` }
          : headers,
        signal: composed.signal,
        // Never let a redirect choose where the bearer goes.
        redirect: "error",
      }),
      aborted,
    ]);
  } catch (err) {
    composed.cleanup();
    if (bound.signal.aborted && !signal?.aborted) {
      throw new TypeError(
        `Artifact request headers timed out after ${ARTIFACT_HEADER_TIMEOUT_MS} ms`,
      );
    }
    throw err;
  } finally {
    clearTimeout(timer);
    if (onAbort) composed.signal.removeEventListener("abort", onAbort);
  }
  return { response, release: composed.cleanup };
}

async function* readChunks(
  response: Response,
): AsyncGenerator<Uint8Array<ArrayBuffer>> {
  if (!response.body) return;
  const reader = response.body.getReader();
  // True only while suspended at a yield, so a caller that stops early cancels
  // the transfer. Cancelling an errored stream rejects (WHATWG ReadableStreamCancel).
  let readable = false;
  try {
    while (true) {
      readable = false;
      const { done, value } = await reader.read();
      if (done) return;
      readable = true;
      if (value) yield value;
    }
  } finally {
    if (readable) await reader.cancel();
    reader.releaseLock();
  }
}

/**
 * Wait after a busy or failing response (408, 429, 5xx) and return true, so
 * the caller asks again. Return false when the status is not retryable or
 * the file's wait budget is spent.
 */
async function waitIfBusy(
  response: Response,
  busy: { retries: number; waitedMs: number },
  signal: AbortSignal | undefined,
): Promise<boolean> {
  if (!RETRYABLE_STATUSES.has(response.status)) return false;
  const seconds = Number(response.headers.get("retry-after"));
  const delay =
    Number.isFinite(seconds) && seconds > 0
      ? seconds * 1000
      : backoffMs(busy.retries);
  if (busy.waitedMs + delay > MAX_BUSY_WAIT_MS) return false;
  await response.body?.cancel();
  await sleep(delay, signal);
  busy.retries += 1;
  busy.waitedMs += delay;
  return true;
}

function backoffMs(attempt: number): number {
  return Math.min(1000 * 2 ** attempt, MAX_RETRY_DELAY_MS);
}

async function httpError(response: Response): Promise<Error> {
  let name = "";
  try {
    const data = (await response.json()) as { error_name?: unknown };
    if (typeof data.error_name === "string") name = data.error_name;
  } catch {
    // The body is optional diagnostics.
  }
  if (response.status === 429 && name === "DOWNLOAD_QUOTA_EXHAUSTED") {
    return new Error(COPY.deposit.recoveryArtifacts.downloadLimitReached);
  }
  const message = COPY.deposit.recoveryArtifacts.downloadFailedHttp(
    response.status,
    name,
  );
  // A rejected bearer takes the same re-auth path as a JSON-RPC rejection.
  if (response.status === 401) {
    return new JsonRpcError(AUTH_REJECTED_RPC_CODE, message, "wire");
  }
  if (response.status === 409 && name === "ARTIFACTS_NOT_READY") {
    return new ArtifactsNotReadyError(false);
  }
  if (response.status === 409 && name === "INVALID_STATE") {
    return new ArtifactsNotReadyError(true);
  }
  return new Error(message);
}

function sleep(ms: number, signal: AbortSignal | undefined): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason);
      return;
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(signal?.reason);
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}
