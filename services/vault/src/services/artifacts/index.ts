export {
  assertBundleBoundToVault,
  type VaultBindingContext,
} from "./artifactBinding";
export {
  downloadArtifactsFromResponse,
  fetchAndDownloadArtifacts,
  type ArtifactDownloadOutcome,
  type FetchArtifactsOptions,
} from "./artifactDownloadService";
export {
  isFileSystemAccessSupported,
  openArtifactSaveTarget,
  type ArtifactSaveMethod,
  type ArtifactSaveTarget,
} from "./artifactSaveTarget";
export {
  ArtifactDownloadCancelledError,
  ArtifactDownloadTooLargeError,
  ArtifactFileAccessError,
} from "./errors";
// The validator itself stays internal to this service; only the error-value
// cap is published, so fixtures that must sit under it (the god-mode demo)
// can derive their size instead of hardcoding one that silently drifts.
export { MAX_ERROR_VALUE_BYTES } from "./streamingArtifactValidator";
