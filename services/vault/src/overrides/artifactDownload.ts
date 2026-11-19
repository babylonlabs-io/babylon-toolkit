import type {
  ArtifactSaveTarget,
  FetchArtifactsOptions,
} from "@/services/artifacts";

import { createOverrideStore } from "./store";

/**
 * What the hook knows about the deposit before it has an Ethereum wallet or
 * an indexer vault id; the demo derives the rest itself.
 */
export interface DemoArtifactRequest {
  /** Pegin txid, hex without `0x`. */
  peginTxid: string;
  /** x-only, 64 hex, no prefix. */
  depositorPk: string;
  providerAddress: string;
  /** The connected Ethereum address, or undefined without a wallet. */
  depositorEthAddress: string | undefined;
}

/**
 * Stands in for the real `fetchAndDownloadArtifacts`. Resolves to nothing
 * rather than an outcome: the activation gate is satisfied only by a receipt,
 * and a receipt is written only from an outcome, so no simulated download can
 * unlock a real vault's activation.
 */
export type ArtifactDownloadFn = (
  target: ArtifactSaveTarget,
  request: DemoArtifactRequest,
  options?: FetchArtifactsOptions,
) => Promise<void>;

const artifactDownloadOverrideStore = createOverrideStore<ArtifactDownloadFn>();

/** Imperative: read at interaction time (download start), not in render. */
export const getArtifactDownloadOverride = artifactDownloadOverrideStore.get;
export const setArtifactDownloadOverride = artifactDownloadOverrideStore.set;
