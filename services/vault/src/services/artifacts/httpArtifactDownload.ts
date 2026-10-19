/**
 * Download the recovery artifacts over the VP's authenticated HTTP routes.
 *
 * The VP serves one JSON manifest (transaction graph, verifying key, one
 * entry per challenger) and one original-CBOR file per challenger session.
 * This module fetches them through the proxy and rebuilds the JSON-RPC
 * response that `vaultProvider_requestDepositorClaimerArtifacts` returned:
 * each session becomes `decryptor_artifacts_hex`, the hex of its CBOR bytes.
 * So the same streaming validator, vault binding and saved-file format apply
 * to both download paths. The depositor CLI does the same conversion.
 *
 * Each session is checked against its strong SHA-256 ETag before any of its
 * bytes go out, and a broken transfer resumes with `Range` + `If-Range`.
 * One session (at most 256 MiB) is held in memory at a time.
 */

import {
  AUTH_REJECTED_RPC_CODE,
  JsonRpcError,
  VpResponseValidationError,
} from "@babylonlabs-io/ts-sdk/tbv/core/clients";
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex } from "@noble/hashes/utils.js";

/** Largest original session the VP serves. */
const MAX_SESSION_BYTES = 256 * 1024 * 1024;

/** Attempts per file, shared by retries and resumes. */
const MAX_ATTEMPTS = 8;

/** Upper bound for one wait between attempts. */
const MAX_RETRY_DELAY_MS = 30_000;

/** Bytes hex-encoded at once, so one session never becomes one huge string. */
const HEX_SLICE_BYTES = 1024 * 1024;

const HEX32_RE = /^[0-9a-f]{64}$/;

/** A strong ETag that holds a lowercase SHA-256 hex digest. */
const SHA256_ETAG_RE = /^"([0-9a-f]{64})"$/;

const CONTENT_RANGE_RE = /^bytes (\d+)-(\d+)\/(\d+)$/;

/**
 * The VP answers 409 while the peg-in is not yet eligible or its artifacts
 * are not finished. The download hook waits and retries on this error.
 */
export class ArtifactsNotReadyError extends Error {
  constructor() {
    super("Vault provider artifacts are not ready yet");
    this.name = "ArtifactsNotReadyError";
  }
}

interface ManifestSession {
  url: string;
  byteLength: number;
}

interface Manifest {
  txGraphJson: string;
  verifyingKeyHex: string;
  sessions: Map<string, ManifestSession>;
}

/**
 * Fetch the artifacts and return them as a JSON-RPC success response whose
 * body streams as the sessions arrive.
 *
 * @param artifactsBaseUrl - `${VP_PROXY_URL}/artifacts/${vpAddress}`.
 * @param peginTxid        - Pegin txid, hex without `0x`.
 * @param getToken         - Returns the JSON-RPC-subject bearer, or null
 *                           when none is cached (the VP then answers 401).
 */
export async function fetchHttpArtifactsResponse(
  artifactsBaseUrl: string,
  peginTxid: string,
  getToken: () => Promise<string | null>,
  signal?: AbortSignal,
): Promise<Response> {
  const txid = peginTxid.toLowerCase();
  const baseUrl = `${artifactsBaseUrl}/${txid}`;
  const manifest = parseManifest(
    await fetchManifest(`${baseUrl}/manifest`, getToken, signal),
    baseUrl,
    txid,
  );

  const encoder = new TextEncoder();
  const head = encoder.encode(
    `{"jsonrpc":"2.0","id":1,"result":{"tx_graph_json":` +
      `${JSON.stringify(manifest.txGraphJson)},"verifying_key_hex":` +
      `${JSON.stringify(manifest.verifyingKeyHex)},"babe_sessions":{`,
  );
  const tail = encoder.encode("}}}");
  const sessionOpen = (key: string, index: number) =>
    encoder.encode(
      `${index === 0 ? "" : ","}"${key}":{"decryptor_artifacts_hex":"`,
    );
  const sessionClose = encoder.encode('"}');

  // The exact length, so the progress bar has a real total.
  let totalBytes = head.byteLength + tail.byteLength;
  [...manifest.sessions].forEach(([key, session], index) => {
    totalBytes +=
      sessionOpen(key, index).byteLength +
      session.byteLength * 2 +
      sessionClose.byteLength;
  });

  async function* body(): AsyncGenerator<Uint8Array> {
    yield head;
    let index = 0;
    for (const [key, session] of manifest.sessions) {
      const chunks = await downloadSession(session, getToken, signal);
      yield sessionOpen(key, index++);
      for (const chunk of chunks) {
        for (let i = 0; i < chunk.byteLength; i += HEX_SLICE_BYTES) {
          yield encoder.encode(
            bytesToHex(chunk.subarray(i, i + HEX_SLICE_BYTES)),
          );
        }
      }
      yield sessionClose;
    }
    yield tail;
  }

  const iterator = body();
  const stream = new ReadableStream<Uint8Array>({
    async pull(controller) {
      const next = await iterator.next();
      if (next.done) controller.close();
      else controller.enqueue(next.value);
    },
    async cancel() {
      await iterator.return(undefined);
    },
  });
  return new Response(stream, {
    status: 200,
    headers: {
      "content-type": "application/json",
      "content-length": String(totalBytes),
    },
  });
}

async function fetchManifest(
  url: string,
  getToken: () => Promise<string | null>,
  signal: AbortSignal | undefined,
): Promise<unknown> {
  for (let attempt = 0; ; attempt++) {
    let response: Response;
    try {
      response = await fetchWithToken(url, getToken, {}, signal);
    } catch (err) {
      if (!isNetworkError(err, signal) || attempt + 1 >= MAX_ATTEMPTS) {
        throw err;
      }
      await sleep(backoffMs(attempt), signal);
      continue;
    }
    const delay = retryDelayMs(response, attempt);
    if (delay !== null) {
      await response.body?.cancel();
      await sleep(delay, signal);
      continue;
    }
    if (response.status !== 200) throw await httpError(response);
    try {
      return await response.json();
    } catch {
      throw new VpResponseValidationError("Artifact manifest is not JSON");
    }
  }
}

function parseManifest(raw: unknown, baseUrl: string, txid: string): Manifest {
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

  const sessions = new Map<string, ManifestSession>();
  for (const [key, value] of Object.entries(babe_sessions)) {
    if (!HEX32_RE.test(key)) throw invalid(`challenger key ${key}`);
    const { download_path, byte_length } = (value ?? {}) as Record<
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
      byte_length <= 0 ||
      byte_length > MAX_SESSION_BYTES
    ) {
      throw invalid(`byte_length for ${key}`);
    }
    sessions.set(key, {
      url: `${baseUrl}/sessions/${key}`,
      byteLength: byte_length,
    });
  }
  return {
    txGraphJson: tx_graph_json,
    verifyingKeyHex: verifying_key_hex,
    sessions,
  };
}

/**
 * Download one session, resuming after a broken transfer. Returns the
 * chunks only after their SHA-256 matches the ETag.
 */
async function downloadSession(
  session: ManifestSession,
  getToken: () => Promise<string | null>,
  signal: AbortSignal | undefined,
): Promise<Uint8Array[]> {
  let chunks: Uint8Array[] = [];
  let received = 0;
  let etag: string | null = null;
  let hasher = sha256.create();
  let lastError: unknown = null;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const headers: Record<string, string> =
      etag !== null && received > 0
        ? { Range: `bytes=${received}-`, "If-Range": etag }
        : {};
    let response: Response;
    try {
      response = await fetchWithToken(session.url, getToken, headers, signal);
    } catch (err) {
      if (!isNetworkError(err, signal)) throw err;
      lastError = err;
      await sleep(backoffMs(attempt), signal);
      continue;
    }

    const delay = retryDelayMs(response, attempt);
    if (delay !== null) {
      await response.body?.cancel();
      await sleep(delay, signal);
      continue;
    }

    const current = response.headers.get("etag");
    if (current === null || !SHA256_ETAG_RE.test(current)) {
      await response.body?.cancel();
      if (response.status === 200 || response.status === 206) {
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
    } else if (response.status === 206 && received > 0) {
      const range = CONTENT_RANGE_RE.exec(
        response.headers.get("content-range") ?? "",
      );
      if (
        current !== etag ||
        !range ||
        Number(range[1]) !== received ||
        Number(range[3]) !== session.byteLength
      ) {
        await response.body?.cancel();
        throw new VpResponseValidationError(
          "Resumed artifact session does not match the first response",
        );
      }
      end = Number(range[2]) + 1;
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
      }
    } catch (err) {
      if (signal?.aborted || err instanceof VpResponseValidationError) {
        throw err;
      }
      // Keep the bytes received so far; the next attempt resumes after them.
      lastError = err;
    }

    if (received === session.byteLength) {
      if (`"${bytesToHex(hasher.digest())}"` !== etag) {
        throw new VpResponseValidationError(
          "Artifact session bytes do not match their ETag",
        );
      }
      return chunks;
    }
  }
  throw new VpResponseValidationError(
    `Artifact session download failed after ${MAX_ATTEMPTS} attempts` +
      (lastError ? `: ${String(lastError)}` : ""),
  );
}

/** `fetch` rejects with a TypeError on a network failure. */
function isNetworkError(err: unknown, signal: AbortSignal | undefined) {
  return err instanceof TypeError && !signal?.aborted;
}

async function fetchWithToken(
  url: string,
  getToken: () => Promise<string | null>,
  headers: Record<string, string>,
  signal: AbortSignal | undefined,
): Promise<Response> {
  const token = await getToken();
  return fetch(url, {
    headers: token ? { ...headers, Authorization: `Bearer ${token}` } : headers,
    signal,
    // Never let a redirect choose where the bearer goes.
    redirect: "error",
  });
}

async function* readChunks(response: Response): AsyncGenerator<Uint8Array> {
  if (!response.body) return;
  const reader = response.body.getReader();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) return;
      if (value) yield value;
    }
  } finally {
    reader.releaseLock();
  }
}

/** Delay before a retry of a busy (429) or timed-out (504) response. */
function retryDelayMs(response: Response, attempt: number): number | null {
  if (response.status !== 429 && response.status !== 504) return null;
  if (attempt + 1 >= MAX_ATTEMPTS) return null;
  const seconds = Number(response.headers.get("retry-after"));
  return Number.isFinite(seconds) && seconds > 0
    ? Math.min(seconds * 1000, MAX_RETRY_DELAY_MS)
    : backoffMs(attempt);
}

function backoffMs(attempt: number): number {
  return Math.min(1000 * 2 ** attempt, MAX_RETRY_DELAY_MS);
}

async function httpError(response: Response): Promise<Error> {
  let name = "";
  try {
    const data = (await response.json()) as { error_name?: unknown };
    if (typeof data.error_name === "string") name = ` ${data.error_name}`;
  } catch {
    // The body is optional diagnostics.
  }
  const message = `Artifact download failed: HTTP ${response.status}${name}`;
  // A rejected bearer takes the same re-auth path as a JSON-RPC rejection.
  if (response.status === 401) {
    return new JsonRpcError(AUTH_REJECTED_RPC_CODE, message, "wire");
  }
  if (response.status === 409) return new ArtifactsNotReadyError();
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
