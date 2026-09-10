/**
 * Service for fetching and saving BaBe Decryptor artifacts.
 *
 * These artifacts are what lets a depositor claim their vault funds without
 * the vault provider's cooperation, so a download that "succeeded" without
 * producing a valid, complete file on disk is a silent loss of that recovery
 * path. Two things follow from that:
 *
 * - **Validation is mandatory and covers the whole body.** The payload is
 *   ~1.3 GB and cannot be parsed with `JSON.parse`, so it is checked
 *   incrementally by {@link ArtifactStreamValidator} as it streams. Nothing
 *   is skipped on the basis of size.
 * - **Success means the bytes are durably saved**, not that a fetch resolved.
 *   The body is piped into an {@link ArtifactSaveTarget} and only committed
 *   after the validator has seen the closing brace.
 *
 * Bytes are validated, hashed, and written chunk-by-chunk in a single pass,
 * so the full body is never held in memory on the File System Access path.
 *
 * What lands on disk is the envelope's `result` value alone, not the JSON-RPC
 * response around it. `jsonrpc` and `id` are transport framing with no meaning
 * in a saved file, and the unwrapped shape is what the rest of the toolchain
 * already reads — btc-vault's `tools/artifact-downloader` writes the identical
 * layout, so a bundle saved here and one fetched with the CLI are
 * interchangeable. The validator reports the payload's byte range as it parses
 * (see `streamingArtifactValidator.ts`), so stripping the envelope costs no
 * extra pass and no buffering.
 *
 * The bundle is also bound to the deposit it was requested for: the envelope
 * names no vault, but the transaction graph inside it does, so its claim and
 * payout transactions are checked against the requested pegin txid and its
 * depositor key against the requested one. See `artifactBinding.ts`.
 *
 * What this does NOT establish: that the artifact bytes decrypt correctly. No
 * client-side BaBe verifier exists, so the payload is proven well-formed and
 * addressed to this deposit, never proven usable.
 */

import { stripHexPrefix } from "@babylonlabs-io/ts-sdk/tbv/core";
import {
  JsonRpcClient,
  VpResponseValidationError,
  vpTokenRegistry,
} from "@babylonlabs-io/ts-sdk/tbv/core/clients";
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex } from "@noble/hashes/utils.js";

import { logger } from "@/infrastructure";
import { getVpProxyUrl } from "@/utils/rpc";

import {
  assertBundleBoundToVault,
  type VaultBindingContext,
} from "./artifactBinding";
import type {
  ArtifactSaveMethod,
  ArtifactSaveStream,
  ArtifactSaveTarget,
} from "./artifactSaveTarget";
import {
  ArtifactDownloadCancelledError,
  ArtifactDownloadTooLargeError,
} from "./errors";
import { ArtifactStreamValidator } from "./streamingArtifactValidator";

/** Timeout for the artifact request RPC call (artifacts can be large). */
const RPC_TIMEOUT_MS = 120 * 1000;

/**
 * Fallback total used by the progress bar when the server omits
 * Content-Length — which the streaming proxy always does.
 *
 * A measured vault-devnet bundle is 1,410,824,702 bytes (8 challengers at
 * ~176 MB of hex each). The estimate sits above that so the displayed
 * percentage does not saturate before the transfer finishes; the card clamps
 * to 100% regardless, so an undershoot is cosmetic rather than harmful.
 */
const ARTIFACT_TOTAL_FALLBACK_BYTES = 1_600_000_000;

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

/** Evidence that a validated bundle was written to disk. */
export interface ArtifactDownloadOutcome {
  filename: string;
  /** Size of the saved file, which excludes the JSON-RPC envelope. */
  byteLength: number;
  /**
   * SHA-256 of the saved file, computed during the same streaming pass — so
   * a user running `sha256sum` on the artifact file reproduces it.
   */
  sha256: string;
  method: ArtifactSaveMethod;
}

/**
 * Fetch artifacts from the vault provider, validate them as they stream, and
 * save them to `target`.
 *
 * Resolves only when the whole body has been validated and durably written.
 * Throws `JsonRpcError` for an error envelope, `VpResponseValidationError` for
 * a malformed or truncated payload, `ArtifactFileAccessError` when the save
 * fails, and `ArtifactDownloadCancelledError` when the caller cancels.
 *
 * @param providerAddress - Vault provider's Ethereum address.
 * @param peginTxid       - Bitcoin pegin transaction ID (hex, with or without 0x prefix).
 * @param depositorPk     - Depositor's Bitcoin public key.
 * @param target          - Where to write; obtained from `openArtifactSaveTarget`.
 */
export async function fetchAndDownloadArtifacts(
  providerAddress: string,
  peginTxid: string,
  depositorPk: string,
  target: ArtifactSaveTarget,
  options?: FetchArtifactsOptions,
): Promise<ArtifactDownloadOutcome> {
  const normalizedPeginTxid = stripHexPrefix(peginTxid);

  // The caller (useArtifactDownload) primes the bearer before invoking
  // this service when the registry is cold, so peek() returns the active
  // provider and the request goes out with a valid Authorization header
  // for this auth-gated RPC. `callRaw` does not reactively refresh when the
  // server rejects the bearer, so a token that goes stale mid-download
  // bubbles up as an error and the caller's auth-failure retry path handles
  // re-priming.
  const tokenProvider = vpTokenRegistry.peek(normalizedPeginTxid);

  const client = new JsonRpcClient({
    baseUrl: getVpProxyUrl(providerAddress),
    timeout: RPC_TIMEOUT_MS,
    // Artifact requests are idempotent reads — safe to retry on transient errors
    retryableFor: () => true,
    tokenProvider,
  });

  let response: Response;
  try {
    response = await client.callRaw(
      "vaultProvider_requestDepositorClaimerArtifacts",
      {
        pegin_txid: normalizedPeginTxid,
        depositor_pk: stripHexPrefix(depositorPk),
      },
      options?.signal,
    );
  } catch (err) {
    throw normalizeCancellation(err, options);
  }

  return downloadArtifactsFromResponse(response, target, options, {
    peginTxid: normalizedPeginTxid,
    depositorPk,
  });
}

/**
 * Read the body once, feeding every chunk through the validator, the digest,
 * and the save stream in that order. Validating before writing means a
 * rejected chunk never reaches disk.
 *
 * Exported so the dev-only artifact mock can drive the real pipeline from a
 * synthetic response: a simulation that skipped validation and the file sink
 * would not exercise anything worth exercising.
 */
export async function downloadArtifactsFromResponse(
  response: Response,
  target: ArtifactSaveTarget,
  options: FetchArtifactsOptions | undefined,
  binding: VaultBindingContext,
): Promise<ArtifactDownloadOutcome> {
  if (!response.body) {
    // Every real transport gives a readable stream; without one we cannot
    // validate incrementally, and silently buffering instead would reinstate
    // the unbounded-memory path this service exists to remove.
    throw new VpResponseValidationError(
      "Artifact response body is not readable as a stream",
    );
  }

  const contentLengthHeader = response.headers.get("content-length");
  const headerTotal = contentLengthHeader ? Number(contentLengthHeader) : NaN;
  const totalBytes =
    Number.isFinite(headerTotal) && headerTotal > 0
      ? headerTotal
      : ARTIFACT_TOTAL_FALLBACK_BYTES;

  const stream = await target.open();
  const validator = new ArtifactStreamValidator();
  const hasher = sha256.create();
  const reader = response.body.getReader();
  /** Bytes read off the wire; bounds the transfer and drives progress. */
  let received = 0;
  /** Bytes actually written — the envelope-stripped payload. */
  let written = 0;

  options?.onProgress?.(0, totalBytes);

  try {
    while (true) {
      if (options?.isCancelled?.()) {
        await reader.cancel().catch(() => undefined);
        throw new ArtifactDownloadCancelledError();
      }

      let chunk: ReadableStreamReadResult<Uint8Array<ArrayBuffer>>;
      try {
        chunk = await reader.read();
      } catch (err) {
        throw normalizeCancellation(err, options);
      }
      if (chunk.done) break;
      if (!chunk.value) continue;

      received += chunk.value.byteLength;
      if (received > target.maxBytes) {
        throw new ArtifactDownloadTooLargeError(received, target.maxBytes);
      }

      // Only the bytes inside the envelope's `result` are saved; the
      // JSON-RPC framing is dropped so the file matches what the CLI
      // toolchain reads. The validator still sees every byte.
      const span = validator.update(chunk.value);
      if (span) {
        const payload = chunk.value.subarray(span.start, span.end);
        hasher.update(payload);
        await stream.write(payload);
        written += payload.byteLength;
      }

      options?.onProgress?.(received, totalBytes);
    }

    // Rejects a truncated document — the proxy signals a mid-stream backend
    // failure by destroying the connection, not by sending an error envelope.
    const validated = validator.finish();

    // Schema-valid is not the same as ours: nothing in the envelope names the
    // deposit, so the tx graph is what proves the bundle belongs to it.
    assertBundleBoundToVault(
      validated.txGraph,
      Object.keys(validated.result.babe_sessions),
      binding,
    );

    // Unreachable while `finish()` requires a schema-valid result object, but
    // a receipt is only meaningful if it describes real bytes on disk — so
    // the invariant is asserted rather than assumed across future edits.
    if (written === 0) {
      throw new VpResponseValidationError(
        "Artifact response yielded no payload bytes to save",
      );
    }
  } catch (err) {
    await discardQuietly(stream);
    throw err;
  } finally {
    reader.releaseLock();
  }

  try {
    await stream.commit();
  } catch (err) {
    // A rejected close leaves the writable un-aborted, so its temporary file
    // can linger until the browser reclaims it. Abandon the transaction
    // explicitly rather than relying on that.
    await discardQuietly(stream);
    throw err;
  }

  return {
    filename: target.filename,
    byteLength: written,
    sha256: bytesToHex(hasher.digest()),
    method: target.method,
  };
}

/**
 * A cancellation can surface as our own sentinel, the RPC client's "Request
 * aborted", or a DOM AbortError. Normalize all of them so the caller's catch
 * swallows the cancel instead of rendering it as a download failure.
 */
function normalizeCancellation(
  err: unknown,
  options: FetchArtifactsOptions | undefined,
): unknown {
  if (err instanceof ArtifactDownloadCancelledError) return err;
  if (options?.signal?.aborted || options?.isCancelled?.()) {
    return new ArtifactDownloadCancelledError();
  }
  return err;
}

/** Never let a cleanup failure mask the error that caused the cleanup. */
async function discardQuietly(stream: ArtifactSaveStream): Promise<void> {
  try {
    await stream.discard();
  } catch (discardErr) {
    logger.warn("Failed to discard the partial artifact download", {
      category: "activation",
      reason: String(discardErr),
    });
  }
}
