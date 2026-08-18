import type {
  ArtifactSaveTarget,
  FetchArtifactsOptions,
  VaultBindingContext,
} from "@/services/artifacts";

import { createOverrideStore } from "./store";

/**
 * Stands in for the real `fetchAndDownloadArtifacts`. Resolves to nothing
 * rather than an outcome: the activation gate is satisfied only by a receipt,
 * and a receipt is written only from an outcome, so no simulated download can
 * unlock a real vault's activation.
 */
export type ArtifactDownloadFn = (
  target: ArtifactSaveTarget,
  binding: VaultBindingContext,
  options?: FetchArtifactsOptions,
) => Promise<void>;

const artifactDownloadOverrideStore = createOverrideStore<ArtifactDownloadFn>();

/** Imperative: read at interaction time (download start), not in render. */
export const getArtifactDownloadOverride = artifactDownloadOverrideStore.get;
export const setArtifactDownloadOverride = artifactDownloadOverrideStore.set;
