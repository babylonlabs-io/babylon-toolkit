/**
 * Reader for the run recordings under `e2e/artifacts`, each of which holds a
 * `recording/http.jsonl`.
 *
 * Those files are captured by `e2e/real/actions/recording.ts` during a real
 * devnet peg-in: one JSON line per app fetch/XHR, request and response body
 * verbatim, tagged with the step that was running. That module always
 * described them as "the machine-readable fixture the future `--data=mock`
 * replay consumes" - this is that consumer.
 *
 * Nothing here interprets a payload. This module only parses the file and
 * sorts entries into the four backends the dApp talks to, so the layers
 * above can answer a live request from a recorded one.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const currentDir = path.dirname(fileURLToPath(import.meta.url));

/** One captured request/response pair, exactly as `recording.ts` writes it. */
export interface RecordedExchange {
  /** ISO timestamp of the response. */
  readonly t: string;
  /** The run step that was active, e.g. `deposit-form`. */
  readonly step: string;
  readonly method: string;
  readonly url: string;
  readonly status: number;
  readonly reqBody?: string;
  readonly resBody?: string;
}

/**
 * Which of the dApp's four external boundaries an exchange belongs to.
 *
 * Recognised by hostname/path shape rather than by exact URL: the recording
 * was made against devnet hosts and the capture runs against the localhost
 * bases pinned in `MOCK_ENV_VARS`, so the two never match literally.
 */
export type RecordedBackend =
  | "eth-rpc"
  | "vp-health"
  | "vp-rpc"
  | "graphql"
  | "mempool";

export interface RecordedRun {
  readonly entries: readonly RecordedExchange[];
  /** Entries grouped by backend, in capture order. */
  readonly byBackend: ReadonlyMap<RecordedBackend, readonly RecordedExchange[]>;
}

/**
 * The step a capture replays the run up to.
 *
 * A recorded run is a moving picture: the depositor starts with a funded,
 * confirmed UTXO, spends it, and ends holding unconfirmed change. Replaying
 * "the last response for each request" would mix those moments - the balance
 * from after the deposit beside the vault list from before it - and produce a
 * screenshot of a state that never existed. Cutting the run at one step keeps
 * every screen internally consistent.
 *
 * `deposit-form` is the moment the depositor is looking at the form this
 * capture photographs: funds confirmed, nothing spent yet.
 */
export const DEFAULT_REPLAY_STEP = "deposit-form";

/**
 * The peg-in recording committed to this repository.
 *
 * A single named constant rather than a glob: which run is replayed decides
 * what every captured screen contains, so it is a deliberate choice, not
 * whichever directory happens to sort first.
 */
export const PEGIN_RECORDING_PATH = path.join(
  currentDir,
  "../../artifacts/2026-07-20-173643-pegin/recording/http.jsonl",
);

/**
 * Classify a recorded URL.
 *
 * Returns null for the boundaries a capture must never replay: Sentry
 * envelopes (telemetry, not app data), the AppKit/web3modal asset CDN (the
 * wallet picker's remote images - the injected wallet needs none of it) and
 * the dApp's own origin (documents, bundles, the wasm blob - served by the
 * dev server under test).
 */
function classify(url: string): RecordedBackend | null {
  const { hostname, pathname } = new URL(url);
  if (hostname.includes("sentry.io")) return null;
  if (hostname.includes("web3modal.org")) return null;
  if (hostname.includes("demo.vault-devnet")) return null;
  if (hostname.includes("mempool")) return "mempool";
  if (hostname.includes("indexer-api")) return "graphql";
  if (hostname.includes("vault-provider-proxy")) {
    return pathname.startsWith("/vp-health") ? "vp-health" : "vp-rpc";
  }
  if (hostname.includes("utils-api")) return null;
  // Everything left is the Ethereum JSON-RPC endpoint. Matched last and by
  // exclusion on purpose: the RPC host is an operator choice (publicnode
  // here, Alchemy/Infura elsewhere), so a hostname allowlist would silently
  // drop every eth_call the day someone re-records against a different
  // provider - and a recording with no chain reads replays as a blank app.
  return "eth-rpc";
}

/**
 * Parsed runs, keyed by path.
 *
 * The capture installs the backend once per screen and there are a dozen
 * screens, so without this the same file is read and JSON-parsed a dozen
 * times. The value is only ever read, never handed out for mutation.
 */
const runCache = new Map<string, RecordedRun>();

/**
 * Parse a recording file into entries grouped by backend.
 *
 * Throws when the file is missing or holds no usable exchange. Both mean the
 * capture would go on to photograph an app with no data behind it, which is
 * the failure this whole fixture exists to prevent.
 */
export function loadRecordedRun(
  filePath: string = PEGIN_RECORDING_PATH,
  upToStep: string = DEFAULT_REPLAY_STEP,
): RecordedRun {
  // NUL separates the two halves because it is the one byte that cannot
  // occur in either a file path or a step name, so no pair of inputs can
  // collide on a shared key. Written as an escape, never as the raw byte:
  // an invisible control character in source makes git treat the whole
  // file as binary and stop showing it as a diff.
  const cacheKey = `${filePath}\u0000${upToStep}`;
  const cached = runCache.get(cacheKey);
  if (cached) return cached;

  let raw: string;
  try {
    raw = fs.readFileSync(filePath, "utf8");
  } catch (cause) {
    throw new Error(
      `No recording at ${filePath}. The visual capture replays a recorded ` +
        `devnet run; without it every screen renders the app's error ` +
        `boundary. Re-record with "pnpm --filter vault run e2e:cli".`,
      { cause },
    );
  }

  const parsed: RecordedExchange[] = [];
  for (const [index, line] of raw.split("\n").entries()) {
    if (line.trim() === "") continue;
    let entry: RecordedExchange;
    try {
      entry = JSON.parse(line) as RecordedExchange;
    } catch (cause) {
      throw new Error(
        `${filePath}:${index + 1} is not valid JSON. The recording is ` +
          `append-only JSONL; a truncated line means the capture was killed ` +
          `mid-write and the file must be re-recorded.`,
        { cause },
      );
    }
    if (classify(entry.url) !== null) parsed.push(entry);
  }

  // Cut the run at the requested step. The file is append-only and written in
  // wall-clock order, so the last line tagged with the step is where that
  // moment ends - there is no need to know the step ORDER, only where the
  // named one stops.
  const cutoff = parsed.findLastIndex((entry) => entry.step === upToStep);
  if (cutoff === -1) {
    throw new Error(
      `${filePath} has no exchange recorded during step "${upToStep}". The ` +
        `steps it does contain are: ${[...new Set(parsed.map((entry) => entry.step))].join(", ")}.`,
    );
  }

  const entries = parsed.slice(0, cutoff + 1);
  const byBackend = new Map<RecordedBackend, RecordedExchange[]>();
  for (const entry of entries) {
    const backend = classify(entry.url);
    if (backend === null) continue;
    const bucket = byBackend.get(backend);
    if (bucket) bucket.push(entry);
    else byBackend.set(backend, [entry]);
  }

  if (entries.length === 0) {
    throw new Error(
      `${filePath} holds no replayable exchange up to "${upToStep}". Every ` +
        `line was telemetry or an asset request - the recording captured no ` +
        `app data.`,
    );
  }

  const run: RecordedRun = { entries, byBackend };
  runCache.set(cacheKey, run);
  return run;
}

/** Parse a recorded response body as JSON, or null when it is absent/unparseable. */
export function parseJson<T>(body: string | undefined): T | null {
  if (body === undefined || body === "") return null;
  try {
    return JSON.parse(body) as T;
  } catch {
    return null;
  }
}
