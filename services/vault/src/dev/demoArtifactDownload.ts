/**
 * Demo artifact download (dev / QA only — gated behind
 * NEXT_PUBLIC_FF_GOD_MODE_PANEL and opted into per session via the god-mode
 * panel's "Mock artifact download" toggle).
 *
 * Synthesizes a vault-provider response and feeds it through the *real*
 * download pipeline — the same streaming validator, digest, and file sink the
 * production path uses. Only the network and the bearer-auth prime are
 * skipped. A mock that stubbed out validation and the save target would
 * exercise nothing worth exercising, so instead the scenario selector lets a
 * developer reproduce a hostile or broken provider on demand: a truncated
 * stream, junk in a success envelope, a padded error, a corrupt hex payload.
 *
 * What it deliberately does NOT do is produce a download outcome. The
 * activation gate is satisfied only by a receipt, and a receipt is written
 * only from an outcome — so no simulated download can ever unlock a real
 * vault's activation, however convincing the file it wrote looks. Use the
 * panel's "Clear artifact receipts" action to get back to a pre-download
 * state for re-testing.
 *
 * When the panel flag or the toggle is off, every caller uses the real
 * service — zero behavioural change.
 */

import { useSyncExternalStore } from "react";

import featureFlags from "@/config/featureFlags";
import {
  ArtifactDownloadCancelledError,
  type ArtifactSaveTarget,
  downloadArtifactsFromResponse,
  type FetchArtifactsOptions,
  type VaultBindingContext,
} from "@/services/artifacts";

/**
 * Size of the synthetic decryptor payload, in hex characters.
 *
 * Large enough that the body spans many chunks (so chunk-boundary handling,
 * progress, and backpressure are genuinely exercised) but far below the real
 * ~1.3 GB, which would make every dev iteration a multi-minute wait. Use a
 * real devnet download to test true full-size behaviour.
 */
const DEMO_HEX_CHARS = 8 * 1024 * 1024;

/** Bytes emitted per stream chunk, roughly matching a network read. */
const DEMO_CHUNK_BYTES = 64 * 1024;

/**
 * Pause between chunks. With the size and chunk constants above this makes a
 * simulated transfer run ~12 s — long enough to watch the progress bar, cancel
 * mid-flight, or see where a scenario fails, without being a chore.
 */
const DEMO_CHUNK_DELAY_MS = 90;

/** Pre-byte pause so the indeterminate "Fetching artifacts..." chip shows. */
const DEMO_PRE_BYTE_DELAY_MS = 1_200;

/** Fraction of the body emitted before the `truncated` scenario cuts off. */
const DEMO_TRUNCATION_FRACTION = 0.4;

/** Padding for the scenarios that must exceed any plausible prefix window. */
const DEMO_PADDING_CHARS = 500_000;

/** A syntactically valid x-only challenger pubkey for the synthetic sessions. */
const DEMO_CHALLENGER_PUBKEY = "ab".repeat(32);

/** Stands in for a bundle built against somebody else's deposit. */
const DEMO_FOREIGN_TXID = "ff".repeat(32);

export const DEMO_ARTIFACT_SCENARIOS = [
  "valid",
  "truncated",
  "garbage",
  "error-envelope",
  "non-hex",
  "wrong-vault",
] as const;

export type DemoArtifactScenario = (typeof DEMO_ARTIFACT_SCENARIOS)[number];

/** Human-readable labels for the god-mode selector. */
export const DEMO_ARTIFACT_SCENARIO_LABELS: Record<
  DemoArtifactScenario,
  string
> = {
  valid: "Valid bundle",
  truncated: "Truncated stream (connection dropped)",
  garbage: "Junk inside a success envelope",
  "error-envelope": "Padded JSON-RPC error",
  "non-hex": "Corrupt hex payload",
  "wrong-vault": "Valid bundle for a different deposit",
};

// The mock starts OFF: merely enabling the god-mode panel must not change
// how downloads behave. The panel's "Mock artifact download" toggle opts in
// for the session.
let storeMockEnabled = false;
let storeScenario: DemoArtifactScenario = "valid";
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

function getScenarioSnapshot() {
  return storeScenario;
}

export function setArtifactDownloadMockEnabled(enabled: boolean) {
  storeMockEnabled = enabled;
  emit();
}

export function setArtifactDownloadScenario(scenario: DemoArtifactScenario) {
  storeScenario = scenario;
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

/** The panel selector's reactive view of the chosen scenario. */
export function useArtifactDownloadScenario(): DemoArtifactScenario {
  return useSyncExternalStore(
    subscribe,
    getScenarioSnapshot,
    getScenarioSnapshot,
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
 * Build the wire text for a scenario. The `valid` body is a faithful
 * JSON-RPC envelope: the small fields first, then one oversized
 * `decryptor_artifacts_hex` value, mirroring what the proxy emits.
 */
function demoTxGraph(
  binding: VaultBindingContext,
  scenario: DemoArtifactScenario,
) {
  // `wrong-vault` keeps everything else intact and only swaps the funding
  // transaction, which is the shape of a provider serving another
  // depositor's bundle.
  const peginTxid =
    scenario === "wrong-vault" ? DEMO_FOREIGN_TXID : binding.peginTxid;
  const spend = (vout: number) => ({
    tx: { input: [{ previous_output: `${peginTxid}:${vout}` }] },
  });
  return {
    demo: true,
    claim_tx: spend(1),
    payout_tx: spend(0),
    depositor_pubkey: binding.depositorPk,
    challenger_pubkeys: { local: [DEMO_CHALLENGER_PUBKEY], universal: [] },
  };
}

function demoBodyFor(
  scenario: DemoArtifactScenario,
  binding: VaultBindingContext,
): string {
  if (scenario === "garbage") {
    return JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      result: { junk: "x".repeat(DEMO_PADDING_CHARS) },
    });
  }

  if (scenario === "error-envelope") {
    return JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      error: {
        code: -32011,
        message: `Invalid state: PendingBabeSetup ${"x".repeat(DEMO_PADDING_CHARS)}`,
      },
    });
  }

  const hex =
    scenario === "non-hex"
      ? // A single invalid character deep inside an otherwise valid payload,
        // which only a validator that reads the whole body can catch.
        `${"ab".repeat(DEMO_HEX_CHARS / 4)}zz${"ab".repeat(DEMO_HEX_CHARS / 4)}`
      : "ab".repeat(DEMO_HEX_CHARS / 2);

  return JSON.stringify({
    jsonrpc: "2.0",
    id: 1,
    result: {
      tx_graph_json: JSON.stringify(demoTxGraph(binding, scenario)),
      verifying_key_hex: "abcdef01",
      babe_sessions: {
        [DEMO_CHALLENGER_PUBKEY]: { decryptor_artifacts_hex: hex },
      },
    },
  });
}

/**
 * Wrap the synthetic body in a Response that streams in chunks, so the
 * consumer sees the same shape as a real transfer. The `truncated` scenario
 * closes the stream partway through, which is how a destroyed upstream
 * connection presents to the reader.
 */
function demoResponse(
  scenario: DemoArtifactScenario,
  binding: VaultBindingContext,
): Response {
  const bytes = new TextEncoder().encode(demoBodyFor(scenario, binding));
  const emitBytes =
    scenario === "truncated"
      ? Math.floor(bytes.byteLength * DEMO_TRUNCATION_FRACTION)
      : bytes.byteLength;

  let offset = 0;
  const stream = new ReadableStream<Uint8Array>({
    async pull(controller) {
      if (offset >= emitBytes) {
        controller.close();
        return;
      }
      await sleep(DEMO_CHUNK_DELAY_MS);
      const end = Math.min(offset + DEMO_CHUNK_BYTES, emitBytes);
      controller.enqueue(bytes.slice(offset, end));
      offset = end;
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      // Real streamed responses carry no length, so the progress bar's
      // no-Content-Length fallback is what gets exercised.
    },
  });
}

/**
 * Run the selected scenario through the production download pipeline.
 *
 * Returns nothing: the caller gets no outcome, so no receipt is written and
 * the activation gate stays unsatisfied. That is the point — see the module
 * header.
 */
export async function demoFetchAndDownloadArtifacts(
  target: ArtifactSaveTarget,
  binding: VaultBindingContext,
  options?: FetchArtifactsOptions,
): Promise<void> {
  if (options?.signal?.aborted || options?.isCancelled?.()) {
    throw new ArtifactDownloadCancelledError();
  }

  await sleep(DEMO_PRE_BYTE_DELAY_MS);

  if (options?.signal?.aborted || options?.isCancelled?.()) {
    throw new ArtifactDownloadCancelledError();
  }

  // The outcome is deliberately discarded rather than returned.
  await downloadArtifactsFromResponse(
    demoResponse(storeScenario, binding),
    target,
    options,
    binding,
  );
}
