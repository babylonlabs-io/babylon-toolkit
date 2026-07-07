/**
 * Demo artifact download (dev / QA only — gated behind
 * NEXT_PUBLIC_FF_GOD_MODE_PANEL and opted into per session via the god-mode
 * panel's "Mock artifact download" toggle).
 *
 * Simulates the vault-provider artifact fetch so the artifact dialogs'
 * fetching / progress-bar / downloaded states can be exercised without a
 * reachable vault provider or a real ~1 GB transfer. Matches the real
 * service's contract — byte progress via onProgress, cancellation via
 * isCancelled / signal normalized to ArtifactDownloadCancelledError — but
 * never talks to a VP and never saves a file; it exists purely to drive
 * the UI. When the panel flag or the toggle is off the enabled check
 * returns false and every caller uses the real service — zero behavioural
 * change.
 */

import { useSyncExternalStore } from "react";

import featureFlags from "@/config/featureFlags";
import {
  ArtifactDownloadCancelledError,
  type FetchArtifactsOptions,
} from "@/services/artifacts";

/** Simulated payload size; renders as "1.00 GB" in the progress panel. */
const DEMO_TOTAL_BYTES = 1_000_000_000;
/** Progress ticks; with DEMO_TICK_MS the simulated download takes ~15 s. */
const DEMO_TICK_COUNT = 100;
const DEMO_TICK_MS = 150;
/** Pre-byte pause so the indeterminate "Fetching artifacts..." chip shows. */
const DEMO_PRE_BYTE_DELAY_MS = 1_200;

// The mock starts OFF: merely enabling the god-mode panel must not change
// how downloads behave. The panel's "Mock artifact download" toggle opts in
// for the session.
let storeMockEnabled = false;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getMockEnabledSnapshot() {
  return storeMockEnabled;
}

export function setArtifactDownloadMockEnabled(enabled: boolean) {
  storeMockEnabled = enabled;
  emit();
}

/** The panel checkbox's reactive view of the toggle. */
export function useArtifactDownloadMockEnabled(): boolean {
  return useSyncExternalStore(
    subscribe,
    getMockEnabledSnapshot,
    getMockEnabledSnapshot,
  );
}

/**
 * Imperative check read at interaction time (card clicks, download start).
 * False in production builds: the god-mode flag is compile-time false there.
 */
export function isArtifactDownloadDemoEnabled(): boolean {
  return featureFlags.isGodModePanelEnabled && storeMockEnabled;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Drop-in stand-in for fetchAndDownloadArtifacts. The routing params are
 * accepted (and ignored) so callers can swap the two functions without
 * branching at the call site.
 */
export async function demoFetchAndDownloadArtifacts(
  _providerAddress: string,
  _peginTxid: string,
  _depositorPk: string,
  options?: FetchArtifactsOptions,
): Promise<void> {
  const throwIfCancelled = () => {
    if (options?.signal?.aborted || options?.isCancelled?.()) {
      throw new ArtifactDownloadCancelledError();
    }
  };

  await sleep(DEMO_PRE_BYTE_DELAY_MS);
  throwIfCancelled();

  for (let tick = 1; tick <= DEMO_TICK_COUNT; tick++) {
    await sleep(DEMO_TICK_MS);
    throwIfCancelled();
    options?.onProgress?.(
      Math.round((tick / DEMO_TICK_COUNT) * DEMO_TOTAL_BYTES),
      DEMO_TOTAL_BYTES,
    );
  }
}
