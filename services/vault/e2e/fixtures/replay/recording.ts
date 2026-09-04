/**
 * Reader for a run recording in the JSONL shape that
 * `e2e/real/actions/recording.ts` writes.
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
 * The peg-in fixture committed to this repository.
 *
 * NOT the raw recording under `e2e/artifacts` - that directory is gitignored
 * (`services/vault/.gitignore`), because a raw run is transient, megabytes,
 * and covers the whole flow including the depositor auth-token exchange. It
 * exists only on the machine that recorded it, so anything reading it works
 * locally and finds nothing in CI.
 *
 * This is the derived subset: cut at the `deposit-form` step, stripped of
 * telemetry and asset traffic, checked for credentials, 58KB. Regenerate it
 * from a fresh run with:
 *
 *   node scripts/build-replay-fixture.mjs e2e/artifacts/<run>/recording/http.jsonl
 *
 * Its last two lines were not recorded by that run. They are the indexer's
 * answers to the price-feed and daily-candle queries the liquidations page
 * gained after the recording was made, asked of the same indexer by
 * `scripts/topup-replay-fixture.mjs` and appended verbatim. A fresh recording
 * made by the CLI still would not hold them - it never visits that page - so
 * re-run the top-up after every regeneration.
 *
 * A single named constant rather than a glob: which run is replayed decides
 * what every captured screen contains, so it is a deliberate choice, not
 * whichever file happens to sort first.
 */
export const PEGIN_RECORDING_PATH = path.join(currentDir, "recorded-run.jsonl");

/**
 * Whether `hostname` is `domain` or a subdomain of it.
 *
 * Not `hostname.includes(domain)`, which is what this used to be: that also
 * matches `sentry.io.example.com`, so a fixture naming such a host would have
 * its traffic silently dropped - or, for the matches below that select rather
 * than drop, replayed as the wrong backend. Anchoring on the dot is what makes
 * the check mean "this domain" instead of "these characters appear somewhere".
 */
function isHost(hostname: string, domain: string): boolean {
  return hostname === domain || hostname.endsWith(`.${domain}`);
}

/**
 * Whether any LABEL of `hostname` contains `label`.
 *
 * The dApp's own hosts are matched this way rather than by full domain -
 * `mempool`, `indexer-api` - because those names are deployment-specific and
 * a re-recording against another environment must still classify. Matched
 * against hostname labels, never as a bare substring.
 */
function hasLabel(hostname: string, label: string): boolean {
  return hostname.split(".").some((part) => part.includes(label));
}

/** Vendor domains dropped whole, dot-anchored so a lookalike is not caught. */
const DROPPED_DOMAINS = [
  "sentry.io",
  "web3modal.org",
  "web3modal.com",
  "walletconnect.org",
  "walletconnect.com",
];

/** Deployment-specific hosts dropped by label, for the reason `hasLabel` gives. */
const DROPPED_LABELS = ["demo", "utils-api"];

/**
 * Whether a recorded host's traffic is never replayed: Sentry envelopes
 * (telemetry, not app data, and they carry session ids and user context), the
 * AppKit/web3modal asset CDN (the wallet picker's remote images - the injected
 * wallet needs none of it), and the dApp's own deployment host.
 *
 * Exported because `scripts/build-replay-fixture.mjs` imports it. That builder
 * used to carry its own copy of this list, matching bare labels where this one
 * matches domains, and the two had already drifted: `walletconnect.com` - the
 * host the app's own CSP names in `index.html` - and `web3modal.com` were
 * dropped by the builder and replayed as `eth-rpc` here. One policy, one file.
 *
 * This module must therefore stay a LEAF - no relative imports - and use only
 * erasable syntax: the builder runs under plain `node`, which strips types but
 * cannot resolve an extensionless `./sibling`.
 */
export function isDroppedHost(hostname: string): boolean {
  return (
    DROPPED_DOMAINS.some((domain) => isHost(hostname, domain)) ||
    DROPPED_LABELS.some((label) => hasLabel(hostname, label))
  );
}

/**
 * Classify a recorded URL, or null for a host {@link isDroppedHost} refuses.
 *
 * Note what is NOT here: a check for the dApp's own origin. The devnet dApp is
 * `demo.vault-devnet.babylonlabs.io`, so its documents, bundles and wasm blob
 * are dropped by the `demo` label rather than by anything that knows what an
 * own-origin request is. A recording made against a host without that label -
 * a local dev server - classifies its own `HEAD /` and wasm fetches as
 * `eth-rpc`. They carry no JSON-RPC body, so `buildTables` discards them.
 */
function classify(url: string): RecordedBackend | null {
  const { hostname, pathname } = new URL(url);
  if (isDroppedHost(hostname)) return null;
  if (hasLabel(hostname, "mempool")) return "mempool";
  if (hasLabel(hostname, "indexer-api")) return "graphql";
  if (hasLabel(hostname, "vault-provider-proxy")) {
    return pathname.startsWith("/vp-health") ? "vp-health" : "vp-rpc";
  }
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

  if (parsed.length === 0) {
    throw new Error(
      `${filePath} holds no replayable exchange. Every line was telemetry or ` +
        `an asset request - the recording captured no app data.`,
    );
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

  const run: RecordedRun = { entries, byBackend };
  runCache.set(cacheKey, run);
  return run;
}

/** JSON with object keys sorted, so key ORDER cannot change a lookup key. */
function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object")
    return JSON.stringify(value) ?? "undefined";
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  return `{${Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
    .map(([key, entry]) => `${JSON.stringify(key)}:${stableStringify(entry)}`)
    .join(",")}}`;
}

/**
 * Key a request to the indexer origin.
 *
 * A GraphQL POST is named by its operation AND its variables; anything else
 * on this origin - today only the bodyless `GET /health` the health check
 * issues - is named by method and path. Both halves are needed.
 *
 * Keyed on the body alone, every bodyless or unparseable request collapsed to
 * the empty string, which is the key `GET /health` indexes under. So the
 * health check passed by coincidence rather than by design, and anything else
 * bodyless reaching this origin was answered `200` with `"{}"` - a body
 * carrying neither `data` nor `errors`, which renders as an empty state with
 * NO miss recorded.
 *
 * A POST is keyed on its operation rather than its path because the two
 * differ by design: the recorded indexer serves GraphQL at `/`, while
 * `MOCK_ENV_VARS` pins `/graphql`. Keying a POST on its path would match
 * nothing and every screen would render empty.
 *
 * `variables` are part of the key because an operation name is not one
 * question. `fetchVaultProviderStats` issues one `GetVaultsByProvider` per
 * vault provider; the recording holds a single provider, so without
 * `variables` every provider on a multi-provider deployment would be served
 * the first one's vaults - identical rows, and no miss to say so.
 */
export function graphqlKey(
  method: string,
  pathname: string,
  body: string | undefined,
): string {
  const parsed = parseJson<{
    operationName?: string;
    query?: string;
    variables?: unknown;
  }>(body);
  const operation =
    parsed?.operationName ?? (parsed?.query ?? "").replace(/\s+/g, " ").trim();
  if (operation === "") return `${method} ${pathname}`;
  return `${operation} ${stableStringify(parsed?.variables)}`;
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
