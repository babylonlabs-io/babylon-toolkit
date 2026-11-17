/**
 * Save a depositor's recovery kit as one deterministic ustar tar.
 *
 * The kit is what lets a depositor claim without the vault provider, so a
 * download that "succeeded" without a complete file on disk is a silent loss
 * of that recovery path. The manifest is validated and bound to the deposit
 * before any session is requested, each session is written only after its
 * SHA-256 equals the provider's ETag, `claim.json` is the last entry, and
 * success means the save target committed. `artifactBinding.ts` says what the
 * binding does and does not prove.
 *
 * What this does NOT establish: that the session bytes decrypt correctly. No
 * client-side BaBe verifier exists, so the kit is proven well-formed and
 * addressed to this deposit, never proven usable.
 */

import { processPublicKeyToXOnly } from "@babylonlabs-io/ts-sdk/tbv/core";
import {
  derivePeginVaultId,
  VpResponseValidationError,
  vpTokenRegistry,
} from "@babylonlabs-io/ts-sdk/tbv/core/clients";
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex } from "@noble/hashes/utils.js";

import { COPY } from "@/copy";
import { logger } from "@/infrastructure";
import { combineAbortSignals } from "@/utils/async";
import { getVpArtifactsProxyUrl } from "@/utils/rpc";

import {
  assertBundleBoundToVault,
  assertGraphMatchesPresign,
} from "./artifactBinding";
import type {
  ArtifactSaveMethod,
  ArtifactSaveStream,
  ArtifactSaveTarget,
} from "./artifactSaveTarget";
import {
  buildClaimFile,
  CLAIM_FILE_NAME,
  claimFileByteLength,
  type ClaimFileSession,
  MAX_CLAIM_FILE_BYTES,
  type RecoveryKitIdentity,
  sessionEntryName,
} from "./claimFile";
import {
  ArtifactDownloadCancelledError,
  ArtifactDownloadTooLargeError,
  ArtifactIdentityMismatchError,
} from "./errors";
import {
  downloadRecoveryKitSession,
  type FetchLike,
  fetchRecoveryKitManifest,
} from "./httpArtifactDownload";
import {
  TAR_END_OF_ARCHIVE_BYTES,
  tarEndOfArchive,
  tarEntryBytes,
  tarHeader,
  tarPadding,
} from "./tarWriter";

export interface FetchArtifactsOptions {
  /**
   * Invoked with the bytes received so far and the exact archive size, which
   * is computed from the manifest before any session is requested.
   */
  onProgress?: (receivedBytes: number, totalBytes: number) => void;
  /**
   * Polled before the save target opens, before every write and before the
   * commit. Returning true cancels the download and aborts its in-flight
   * request, so the modal's Cancel releases the connection instead of
   * pulling bytes in the background.
   */
  isCancelled?: () => boolean;
  /**
   * Aborts the underlying requests (threaded into `fetch`). Unlike
   * `isCancelled`, which is polled between reads, this unblocks a
   * `reader.read()` stalled on a silent connection, so Cancel releases the
   * socket immediately instead of hanging until the next byte or EOF.
   */
  signal?: AbortSignal;
}

/** Where the kit comes from: the proxy base URL, the bearer and the fetch. */
export interface RecoveryKitSource {
  /** `${VP_PROXY_URL}/artifacts/${vpAddress}`. */
  artifactsBaseUrl: string;
  /** The JSON-RPC-subject bearer, or null when none is cached. */
  getToken: () => Promise<string | null>;
  fetchImpl: FetchLike;
}

/** Evidence that a validated kit was written to disk. */
export interface ArtifactDownloadOutcome {
  filename: string;
  byteLength: number;
  /**
   * SHA-256 of the saved file, computed during the same streaming pass, so a
   * user running `sha256sum` on the kit reproduces it.
   */
  sha256: string;
  method: ArtifactSaveMethod;
  /** Each session's hash and length, as written to `claim.json`. */
  sessions: Record<string, ClaimFileSession>;
}

/**
 * Fetch the kit from `source`, bind it to `identity`, and save it to `target`.
 *
 * Resolves only when the whole archive has been written and committed.
 * Throws `ArtifactIdentityMismatchError` when the vault id does not derive
 * from the deposit, `JsonRpcError` when the provider rejects the bearer,
 * `ArtifactsNotReadyError` while the provider does not serve the package yet,
 * `VpResponseValidationError` for a malformed manifest or session,
 * `PresignGraphMismatchError` for a graph other than the one signed,
 * `ArtifactDownloadTooLargeError` for an archive the target cannot hold,
 * `ArtifactFileAccessError` when the save fails,
 * `ArtifactDownloadCancelledError` when the caller cancels, and a plain
 * `Error` for a download quota, an unexpected HTTP status or exhausted
 * transfer attempts.
 */
export async function downloadRecoveryKit(
  source: RecoveryKitSource,
  identity: RecoveryKitIdentity,
  target: ArtifactSaveTarget,
  options?: FetchArtifactsOptions,
): Promise<ArtifactDownloadOutcome> {
  // Pure, and before any request: a manifest request charges one attempt of
  // the depositor's download budget. `derivePeginVaultId` validates the
  // address with viem's strict `isAddress`; EIP-55 wallet addresses pass.
  const derivedVaultId = `0x${derivePeginVaultId(identity.peginTxid, identity.depositorEthAddress)}`;
  if (identity.vaultId.toLowerCase() !== derivedVaultId) {
    throw new ArtifactIdentityMismatchError(
      COPY.deposit.recoveryArtifacts.vaultIdMismatch,
    );
  }

  // `internal` aborts the in-flight request when `isCancelled` turns true.
  // Composed with the app's helper: `AbortSignal.any` is missing on
  // Safari < 17.4 and Chrome < 116.
  const internal = new AbortController();
  const composed = combineAbortSignals(
    options?.signal ? [options.signal, internal.signal] : [internal.signal],
  );
  const signal = composed.signal;
  const cancelIfRequested = () => {
    if (options?.isCancelled?.()) {
      internal.abort();
      throw new ArtifactDownloadCancelledError();
    }
  };

  let stream: ArtifactSaveStream | null = null;
  try {
    const manifest = await fetchRecoveryKitManifest(
      source.artifactsBaseUrl,
      identity.peginTxid,
      source.getToken,
      signal,
      source.fetchImpl,
    );
    // Schema-valid is not the same as ours: the tx graph is what proves the
    // kit belongs to this deposit, and the presign fingerprint is the one
    // value the provider never saw.
    const binding = {
      peginTxid: identity.peginTxid,
      depositorPk: identity.depositorPk,
      signedGraphFingerprint: identity.signedGraphFingerprint,
    };
    assertBundleBoundToVault(
      manifest.txGraph,
      [...manifest.sessions.keys()],
      binding,
    );
    assertGraphMatchesPresign(manifest.txGraph, binding);

    // The exact archive size is known before any session is fetched: every
    // session length is in the manifest and every hash is 64 characters.
    const byteLengths = new Map<string, number>();
    let total = TAR_END_OF_ARCHIVE_BYTES;
    for (const session of manifest.sessions.values()) {
      byteLengths.set(session.key, session.byteLength);
      total += tarEntryBytes(session.byteLength);
    }
    const claimLength = claimFileByteLength(identity, manifest, byteLengths);
    // A reader refuses a larger claim.json, so the kit would be unusable.
    if (claimLength > MAX_CLAIM_FILE_BYTES) {
      throw new VpResponseValidationError(
        `Artifact manifest would make claim.json ${claimLength} bytes, above the ${MAX_CLAIM_FILE_BYTES}-byte reader limit`,
      );
    }
    total += tarEntryBytes(claimLength);
    if (total > target.maxBytes) {
      throw new ArtifactDownloadTooLargeError(total, target.maxBytes);
    }
    options?.onProgress?.(0, total);

    cancelIfRequested();
    stream = await target.open();
    const sink = stream;
    const hasher = sha256.create();
    let written = 0;
    let reported = 0;
    const report = (bytes: number) => {
      reported = Math.max(reported, bytes);
      options?.onProgress?.(reported, total);
    };
    const emit = async (bytes: Uint8Array<ArrayBuffer>) => {
      cancelIfRequested();
      if (written + bytes.byteLength > target.maxBytes) {
        throw new ArtifactDownloadTooLargeError(total, target.maxBytes);
      }
      hasher.update(bytes);
      await sink.write(bytes);
      written += bytes.byteLength;
    };

    // Session N is verified and written before session N+1 is requested, so
    // at most one session is in memory.
    const recorded = new Map<string, ClaimFileSession>();
    for (const session of manifest.sessions.values()) {
      const doneBytes = written;
      const { chunks, sha256: digest } = await downloadRecoveryKitSession(
        session,
        source.getToken,
        signal,
        source.fetchImpl,
        (received) => {
          cancelIfRequested();
          report(doneBytes + received);
        },
      );
      await emit(tarHeader(sessionEntryName(session.key), session.byteLength));
      for (const chunk of chunks) await emit(chunk);
      await emit(tarPadding(session.byteLength));
      recorded.set(session.key, {
        sha256: digest,
        byteLength: session.byteLength,
      });
      report(written);
    }

    assertAssembled(
      recorded.size === manifest.sessions.size &&
        [...manifest.sessions.keys()].every((key) => recorded.has(key)),
    );
    const claim = buildClaimFile(identity, manifest, recorded);
    assertAssembled(claim.byteLength === claimLength);
    await emit(tarHeader(CLAIM_FILE_NAME, claim.byteLength));
    await emit(claim);
    await emit(tarPadding(claim.byteLength));
    await emit(tarEndOfArchive());
    assertAssembled(written === total);
    report(total);

    cancelIfRequested();
    await sink.commit();
    return {
      filename: target.filename,
      byteLength: written,
      sha256: bytesToHex(hasher.digest()),
      method: target.method,
      sessions: Object.fromEntries(recorded),
    };
  } catch (err) {
    // Also after a rejected commit: that leaves the writable un-aborted, so
    // its temporary file can linger until the browser reclaims it.
    if (stream) await discardQuietly(stream);
    throw normalizeCancellation(err, options);
  } finally {
    composed.cleanup();
  }
}

/**
 * Download the kit for `identity` from its vault provider through the proxy,
 * with the bearer the registry holds for this deposit.
 */
export async function fetchAndDownloadArtifacts(
  identity: RecoveryKitIdentity,
  target: ArtifactSaveTarget,
  options?: FetchArtifactsOptions,
): Promise<ArtifactDownloadOutcome> {
  // The caller (useArtifactDownload) primes the bearer before invoking
  // this service when the registry is cold, so peek() returns the active
  // provider only when its provider and depositor bindings match this request.
  // The HTTP transport never refreshes a bearer the server rejects, so a
  // token that goes stale mid-download bubbles up as an error and the
  // caller's auth-failure retry path handles re-priming.
  const tokenProvider = vpTokenRegistry.peek({
    peginTxid: identity.peginTxid,
    providerAddress: identity.providerAddress,
    expectedAudienceXOnlyPubkey: processPublicKeyToXOnly(identity.depositorPk),
  });
  return downloadRecoveryKit(
    {
      artifactsBaseUrl: getVpArtifactsProxyUrl(identity.providerAddress),
      getToken: async () => (await tokenProvider?.getJsonRpcToken()) ?? null,
      // Resolved per request rather than captured at module load.
      fetchImpl: (input, init) => globalThis.fetch(input, init),
    },
    identity,
    target,
    options,
  );
}

/**
 * The pipeline's own invariants, unreachable while the pre-flight sizing and
 * the per-session length check hold; a failure discards the sink.
 */
function assertAssembled(condition: boolean): void {
  if (!condition) {
    throw new Error(COPY.deposit.recoveryArtifacts.kitLengthMismatch);
  }
}

/**
 * A cancellation can surface as our own sentinel or as the DOM AbortError
 * `fetch` throws for an aborted signal. Normalize both so the caller's catch
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
