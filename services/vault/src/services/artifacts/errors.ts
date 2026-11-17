/**
 * Error types for the artifact download flow.
 *
 * Payload-shape rejections deliberately reuse the SDK's
 * `VpResponseValidationError` (it already carries a user-safe `.message` plus
 * a technical `.detail`), and JSON-RPC wire errors reuse `JsonRpcError`. Only
 * the failure modes with no existing home — cancellation, the file sink, the
 * size ceiling and a vault id that does not derive from the deposit — get
 * their own class here.
 */

/**
 * Sentinel thrown when the caller cancels the download via
 * `FetchArtifactsOptions.isCancelled` / `FetchArtifactsOptions.signal`, or
 * when the user dismisses the save-location picker. Callers should swallow
 * this instead of surfacing it as an error.
 */
export class ArtifactDownloadCancelledError extends Error {
  constructor() {
    super("Artifact download was cancelled");
    this.name = "ArtifactDownloadCancelledError";
  }
}

/**
 * Thrown when the browser refuses the save target or the write itself fails:
 * a denied File System Access permission, a revoked handle, or a disk error
 * mid-stream. Distinct from a cancellation — the user asked for the file and
 * did not get it, so the flow must surface an error rather than reset quietly.
 */
export class ArtifactFileAccessError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "ArtifactFileAccessError";
  }
}

/**
 * Thrown when the archive exceeds what the active save target can hold.
 *
 * Raised pre-flight from the manifest's session lengths, before any session
 * is requested, and guarded again on every write. Only the anchor-download
 * fallback has a ceiling: it buffers the whole archive before it can hand
 * the browser a Blob, so failing early beats an out-of-memory tab kill after
 * the transfer.
 */
export class ArtifactDownloadTooLargeError extends Error {
  readonly expectedBytes: number;
  readonly maxBytes: number;

  constructor(expectedBytes: number, maxBytes: number) {
    super(
      `Recovery kit of ${expectedBytes} bytes exceeds the ${maxBytes}-byte limit of this browser's download path`,
    );
    this.name = "ArtifactDownloadTooLargeError";
    this.expectedBytes = expectedBytes;
    this.maxBytes = maxBytes;
  }
}

/**
 * Thrown when the vault id the UI passed does not derive from the deposit's
 * pegin txid and depositor address. The id comes from the indexer, so a
 * mismatch is a stale- or compromised-indexer signal, never a retry case.
 */
export class ArtifactIdentityMismatchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ArtifactIdentityMismatchError";
  }
}
