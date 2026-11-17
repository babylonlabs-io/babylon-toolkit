/**
 * Demo artifact download (dev / QA only — gated behind
 * NEXT_PUBLIC_FF_GOD_MODE_PANEL and opted into per session via the god-mode
 * panel's "Mock artifact download" toggle).
 *
 * Stands up an in-memory vault provider and runs the *real* download pipeline
 * against it: the same manifest checks, ETag verification, tar writer and file
 * sink the production path uses. Only the network and the bearer-auth prime
 * are replaced. The scenario selector reproduces a hostile or broken provider
 * on demand: a dropped connection, a manifest that is not JSON, a quota
 * refusal, a session that does not match its ETag, a kit for another deposit.
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

import { derivePeginVaultId } from "@babylonlabs-io/ts-sdk/tbv/core/clients";
import { fingerprintReturnedGraph } from "@babylonlabs-io/ts-sdk/tbv/core/services";
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex } from "@noble/hashes/utils.js";
import { useSyncExternalStore } from "react";

import featureFlags from "@/config/featureFlags";
import type { DemoArtifactRequest } from "@/overrides/artifactDownload";
import {
  type ArtifactSaveTarget,
  downloadRecoveryKit,
  type FetchArtifactsOptions,
} from "@/services/artifacts";

/**
 * Size of the synthetic session. Large enough that the transfer spans many
 * chunks (so progress and backpressure are genuinely exercised) but far below
 * a real session, which would make every dev iteration a long wait. Use a real
 * devnet download to test full-size behaviour.
 */
const DEMO_SESSION_BYTES = 8 * 1024 * 1024;

/** Byte value the synthetic session is filled with. */
const DEMO_SESSION_FILL = 0xab;

/** Bytes emitted per stream chunk, roughly matching a network read. */
const DEMO_CHUNK_BYTES = 64 * 1024;

/**
 * Pause between chunks. With the size and chunk constants above this makes a
 * simulated transfer run ~12 s — long enough to watch the progress bar, cancel
 * mid-flight, or see where a scenario fails, without being a chore.
 */
const DEMO_CHUNK_DELAY_MS = 90;

/** Pause before the manifest answers, so the "Fetching artifacts" chip shows. */
const DEMO_PRE_BYTE_DELAY_MS = 1_200;

/** Fraction of the session emitted before the `truncated` scenario cuts off. */
const DEMO_TRUNCATION_FRACTION = 0.4;

/** A syntactically valid x-only challenger pubkey for the synthetic session. */
const DEMO_CHALLENGER_PUBKEY = "ab".repeat(32);

/** Stands in for a kit built against somebody else's deposit. */
const DEMO_FOREIGN_TXID = "ff".repeat(32);

/** Funding outpoints for the synthetic graph's transactions that do not spend the pegin. */
const DEMO_FUNDING_TXID = "cd".repeat(32);

const DEMO_VERIFYING_KEY_HEX = "abcdef01";

/** The in-memory provider's base URL; nothing ever leaves the page. */
const DEMO_ARTIFACTS_BASE_URL = "https://demo-vault-provider.invalid/artifacts";

const DEMO_TOKEN = "demo-token";

/** Used for the vault id when no Ethereum wallet is connected. */
const DEMO_DEPOSITOR_ETH_ADDRESS = "0x" + "00".repeat(19) + "01";

/** What the VP's quota refusal carries (`Retry-After` past the busy budget). */
const DEMO_QUOTA_RETRY_AFTER_SECONDS = "900";

const HTTP_OK = 200;
const HTTP_TOO_MANY_REQUESTS = 429;
const HTTP_RANGE_NOT_SATISFIABLE = 416;
const HTTP_NOT_FOUND = 404;

export const DEMO_ARTIFACT_SCENARIOS = [
  "valid",
  "truncated",
  "bad-manifest",
  "provider-error",
  "corrupt-session",
  "wrong-vault",
] as const;

export type DemoArtifactScenario = (typeof DEMO_ARTIFACT_SCENARIOS)[number];

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

function demoTxGraph(
  request: DemoArtifactRequest,
  scenario: DemoArtifactScenario,
) {
  // `wrong-vault` keeps everything else intact and only swaps the funding
  // transaction, which is the shape of a provider serving another
  // depositor's kit.
  const peginTxid =
    scenario === "wrong-vault" ? DEMO_FOREIGN_TXID : request.peginTxid;
  // Complete serde transactions, so the presign fingerprint check can hash
  // them like a real graph.
  const spend = (previousOutput: string) => ({
    tx: {
      version: 2,
      lock_time: 0,
      input: [
        {
          previous_output: previousOutput,
          script_sig: "",
          sequence: 0xffffffff,
          witness: [],
        },
      ],
      output: [{ value: 1000, script_pubkey: "51" }],
    },
  });
  return {
    demo: true,
    pegin_tx: spend(`${DEMO_FUNDING_TXID}:0`),
    claim_tx: spend(`${peginTxid}:1`),
    assert_tx: spend(`${DEMO_FUNDING_TXID}:1`),
    payout_tx: spend(`${peginTxid}:0`),
    challenger_subgraphs: {
      [DEMO_CHALLENGER_PUBKEY]: {
        nopayout_tx: spend(`${DEMO_FUNDING_TXID}:2`),
        output_label_hashes: [],
      },
    },
    depositor_pubkey: request.depositorPk,
    challenger_pubkeys: { local: [DEMO_CHALLENGER_PUBKEY], universal: [] },
  };
}

function jsonResponse(body: unknown, status: number, headers = {}): Response {
  const text = JSON.stringify(body);
  return new Response(text, {
    status,
    headers: {
      "content-type": "application/json",
      "content-length": String(new TextEncoder().encode(text).byteLength),
      ...headers,
    },
  });
}

/**
 * Streams `bytes` in paced chunks, stopping at `limit` and then failing like a
 * dropped connection when `limit` is short of the end. Errors the stream when
 * `signal` aborts, as a real fetch body does.
 */
function pacedBody(
  bytes: Uint8Array<ArrayBuffer>,
  limit: number,
  signal: AbortSignal | null | undefined,
): ReadableStream<Uint8Array> {
  let offset = 0;
  return new ReadableStream<Uint8Array>({
    start(controller) {
      signal?.addEventListener("abort", () => controller.error(signal.reason));
    },
    async pull(controller) {
      await sleep(DEMO_CHUNK_DELAY_MS);
      if (signal?.aborted) return;
      if (offset >= limit) {
        if (limit < bytes.byteLength) {
          controller.error(new TypeError("network error"));
        } else {
          controller.close();
        }
        return;
      }
      const end = Math.min(offset + DEMO_CHUNK_BYTES, limit);
      controller.enqueue(bytes.slice(offset, end));
      offset = end;
    },
  });
}

/** The in-memory vault provider: answers the manifest and session URLs. */
function demoFetch(
  scenario: DemoArtifactScenario,
  request: DemoArtifactRequest,
): typeof fetch {
  const depositUrl = `${DEMO_ARTIFACTS_BASE_URL}/${request.peginTxid.toLowerCase()}`;
  const session = new Uint8Array(DEMO_SESSION_BYTES).fill(DEMO_SESSION_FILL);
  const etag = `"${bytesToHex(sha256(session))}"`;

  return async (input, init) => {
    const url = String(input);
    const signal = init?.signal;

    if (url === `${depositUrl}/manifest`) {
      await sleep(DEMO_PRE_BYTE_DELAY_MS);
      signal?.throwIfAborted();
      if (scenario === "bad-manifest") {
        const text = "<!doctype html>";
        return new Response(text, {
          status: HTTP_OK,
          headers: { "content-length": String(text.length) },
        });
      }
      if (scenario === "provider-error") {
        return jsonResponse(
          { error_name: "DOWNLOAD_QUOTA_EXHAUSTED" },
          HTTP_TOO_MANY_REQUESTS,
          { "retry-after": DEMO_QUOTA_RETRY_AFTER_SECONDS },
        );
      }
      return jsonResponse(
        {
          tx_graph_json: JSON.stringify(demoTxGraph(request, scenario)),
          verifying_key_hex: DEMO_VERIFYING_KEY_HEX,
          babe_sessions: {
            [DEMO_CHALLENGER_PUBKEY]: {
              download_path: `/v1/depositor-artifacts/${request.peginTxid.toLowerCase()}/sessions/${DEMO_CHALLENGER_PUBKEY}`,
              byte_length: DEMO_SESSION_BYTES,
            },
          },
        },
        HTTP_OK,
      );
    }

    if (url === `${depositUrl}/sessions/${DEMO_CHALLENGER_PUBKEY}`) {
      signal?.throwIfAborted();
      // Only the truncated scenario breaks a transfer, so only it is resumed;
      // its provider has since dropped the file.
      if (new Headers(init?.headers).has("range")) {
        return new Response(null, { status: HTTP_RANGE_NOT_SATISFIABLE });
      }
      const served =
        scenario === "corrupt-session" ? corruptLastByte(session) : session;
      const limit =
        scenario === "truncated"
          ? Math.floor(DEMO_SESSION_BYTES * DEMO_TRUNCATION_FRACTION)
          : DEMO_SESSION_BYTES;
      return new Response(pacedBody(served, limit, signal), {
        status: HTTP_OK,
        headers: { etag, "content-length": String(DEMO_SESSION_BYTES) },
      });
    }

    return new Response(null, { status: HTTP_NOT_FOUND });
  };
}

function corruptLastByte(
  bytes: Uint8Array<ArrayBuffer>,
): Uint8Array<ArrayBuffer> {
  const corrupt = bytes.slice();
  corrupt[corrupt.length - 1]! ^= 0xff;
  return corrupt;
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
  request: DemoArtifactRequest,
  options?: FetchArtifactsOptions,
): Promise<void> {
  const depositorEthAddress =
    request.depositorEthAddress ?? DEMO_DEPOSITOR_ETH_ADDRESS;
  const identity = {
    vaultId: "0x" + derivePeginVaultId(request.peginTxid, depositorEthAddress),
    peginTxid: request.peginTxid,
    depositorPk: request.depositorPk,
    depositorEthAddress,
    providerAddress: request.providerAddress,
    // No presign ran for a synthetic kit, so the demo stands in the
    // fingerprint of its own valid graph for the one this device recorded.
    signedGraphFingerprint: fingerprintReturnedGraph(
      demoTxGraph(request, "valid"),
    ),
  };

  // The outcome is deliberately discarded rather than returned.
  await downloadRecoveryKit(
    {
      artifactsBaseUrl: DEMO_ARTIFACTS_BASE_URL,
      getToken: async () => DEMO_TOKEN,
      fetchImpl: demoFetch(storeScenario, request),
    },
    identity,
    target,
    options,
  );
}
