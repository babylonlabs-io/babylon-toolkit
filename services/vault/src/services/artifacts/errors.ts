/**
 * Error types for the artifact download flow.
 *
 * Payload-shape rejections deliberately reuse the SDK's
 * `VpResponseValidationError` (it already carries a user-safe `.message` plus
 * a technical `.detail`), and JSON-RPC wire errors reuse `JsonRpcError`. Only
 * the failure modes with no existing home — cancellation, the file sink, and
 * the fallback size ceiling — get their own class here.
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
 * Thrown when the response exceeds what the active save target can hold.
 *
 * Only reachable on the anchor-download fallback, which must buffer the whole
 * body in memory before it can hand a Blob to the browser. Failing loudly
 * beats an out-of-memory tab kill or a silently truncated recovery bundle.
 */
export class ArtifactDownloadTooLargeError extends Error {
  readonly receivedBytes: number;
  readonly maxBytes: number;

  constructor(receivedBytes: number, maxBytes: number) {
    super(
      `Artifact response exceeds the ${maxBytes}-byte limit of this browser's download path (received at least ${receivedBytes} bytes)`,
    );
    this.name = "ArtifactDownloadTooLargeError";
    this.receivedBytes = receivedBytes;
    this.maxBytes = maxBytes;
  }
}
