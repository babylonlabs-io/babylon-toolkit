/**
 * Run recorder — captures the ground truth of a peg-in so a run can be reproduced/inspected offline
 * (and, later, replayed as a mock without the multi-minute waits) instead of re-driving a 30 min–2 hr
 * real flow blind. Three layers:
 *
 *  1. Playwright trace (`trace.zip`) — per-action DOM snapshots + screenshots + full network, browsable
 *     in the Playwright trace viewer. The primary "what did the UI actually look like at step N" tool.
 *  2. Programmatic HTTP capture (`recording/http.jsonl`) — one JSON line per app fetch/XHR
 *     (request + response body/status), tagged with the current step. This is the machine-readable
 *     fixture the future `--data=mock` replay consumes; the VP daemon's `PendingIngestion → … →
 *     Activated` progression is reconstructable from the ordered `batchGetPeginStatus` responses here.
 *  3. Wallet signing capture (`recording/signing.jsonl`) — one JSON line per BTC-wallet signing call
 *     (`signMessage` / `signPsbt` / `signPsbts`): its arguments (message, PSBT hex, PSBT-array) and the
 *     returned signature. These calls go through the injected wallet provider (`window.unisat`, …), NOT
 *     over HTTP, so the HTTP layer never sees them. Because every wallet imports the SAME mnemonic (=
 *     same BTC key), these fixtures are re-signable by another wallet — so one UniSat peg-in yields the
 *     exact message/psbt/psbts inputs a focused OKX / OneKey signing-conformance test can replay,
 *     rather than driving a full peg-in per wallet. Capture is a READ-THROUGH wrapper: it always
 *     delegates to the real provider method untouched, so it can never alter or block signing.
 *
 * Only the dapp page's fetch/XHR is captured for layer 2: the four external boundaries (VP proxy
 * JSON-RPC, indexer GraphQL, Bitcoin mempool REST, Ethereum RPC reads) are all initiated by the dapp
 * page. The ETH write broadcast goes through MetaMask's own provider (not the page) and is
 * intentionally NOT captured — it is the one boundary a page-level recorder / `page.route` mock cannot
 * see.
 *
 * Security: the mnemonic never crosses the network, so it cannot appear here; wallet seed screens occur
 * during import, before recording starts. VP `Authorization: Bearer` tokens are session-scoped and kept
 * for replay fidelity.
 */
import type { BrowserContext, Page, Response } from "@playwright/test";
import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/** Skip capturing bodies larger than this (e.g. the ~450MB artifact blob) — record metadata only. */
const MAX_CAPTURED_BODY_BYTES = 512 * 1024;
/** Only these resource types are app IO worth recording (skip document/script/img/css/font/etc.). */
const CAPTURED_RESOURCE_TYPES = new Set(["fetch", "xhr"]);

export interface Recorder {
  /**
   * Capture the CURRENT screen as queryable DOM (`<seq>-<label>.html`) + a screenshot
   * (`<seq>-<label>.png`) under `recording/`. Playwright's own trace only snapshots DOM around actions
   * IT performs, so a human-driven observe run yields screenshots but no queryable DOM — this fills that
   * gap: the human snapshots each meaningful screen so `pegin.ts` selectors are written against real DOM.
   */
  snapshot(label: string): Promise<void>;
  /** Stop capture and flush the trace to `<dir>/trace.zip`. Best-effort; never throws. */
  stop(): Promise<void>;
}

/** Filesystem-safe, ordered snapshot basename, e.g. `03-select-provider`. */
export function snapshotName(seq: number, label: string): string {
  const slug =
    label
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "screen";
  return `${String(seq).padStart(2, "0")}-${slug}`;
}

/**
 * Append a free-form note (the full line the human typed) to `<dir>/notes.md`, correlated to a snapshot
 * by its basename. Lets the label stay a short filename slug while preserving any extra detail the
 * human wants to attach (e.g. "clicked the gear → Security, auto-lock dropdown here") verbatim.
 */
export function appendNote(
  dir: string,
  name: string,
  note: string,
  log: (m: string) => void,
): void {
  if (!note.trim()) return;
  appendFileSync(join(dir, "notes.md"), `- **${name}** — ${note.trim()}\n`);
  log(`note → ${name}: ${note.trim()}`);
}

/**
 * Write one screen as queryable DOM (`<dir>/<name>.html`) + a full-page screenshot (`<dir>/<name>.png`).
 * Best-effort; never throws. Shared by the observe recorder and the wallet-config helper.
 */
export async function captureSnapshot(
  page: Page,
  dir: string,
  name: string,
  log: (m: string) => void,
): Promise<void> {
  const base = join(dir, name);
  const html = await page.content().catch(() => null);
  if (html !== null) writeFileSync(`${base}.html`, html);
  await page
    .screenshot({ path: `${base}.png`, fullPage: true })
    .catch(() => {});
  log(`snapshot → ${base}.{html,png}`);
}

/**
 * Page-side source for the signing capture (layer 3), wrapping the BTC-wallet provider's signing
 * methods. It is a raw STRING on purpose: passing a TS function to `page.evaluate` / `addInitScript`
 * makes tsx/esbuild inject its `__name` keepNames helper into the serialized body, which is undefined
 * in the browser page (`ReferenceError: __name is not defined`) — a string literal is never
 * transformed, so it runs verbatim. Read-through: each wrapper awaits and returns the REAL method's
 * result and only records in a `finally`, so a fault can never alter or block a signature. Re-scans on
 * an interval so a provider injected/replaced after page load (e.g. post-connect) is still hooked.
 *
 * References only `window` + the exposed `__peginRecordSigning` binding; self-contained (no closures).
 */
const SIGNING_CAPTURE_SOURCE = `(() => {
  if (window.__peginSigningHooked) return;
  window.__peginSigningHooked = true;
  var METHODS = ["signMessage", "signPsbt", "signPsbts"];
  var PATHS = ["unisat","okxwallet.bitcoin","okxwallet.bitcoinSignet","okxwallet.bitcoinTestnet","$onekey.btc","onekey.btc","bitcoin"];
  function safe(value) {
    if (value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value;
    try { return JSON.parse(JSON.stringify(value)); } catch (e) { return String(value); }
  }
  function emit(entry) {
    try { if (window.__peginRecordSigning) window.__peginRecordSigning(JSON.stringify(entry)); } catch (e) {}
  }
  function resolve(path) {
    var node = window;
    var parts = path.split(".");
    for (var i = 0; i < parts.length; i++) {
      if (node == null || typeof node !== "object") return undefined;
      node = node[parts[i]];
    }
    return node && typeof node === "object" ? node : undefined;
  }
  function wrap(provider, name) {
    if (!provider) return;
    for (var i = 0; i < METHODS.length; i++) {
      var method = METHODS[i];
      var fn = provider[method];
      if (typeof fn !== "function" || fn.__peginWrapped) continue;
      (function (m, original) {
        var wrapped = async function () {
          var args = Array.prototype.slice.call(arguments);
          var result, error, hasError = false;
          try { result = await original.apply(this, args); return result; }
          catch (e) { error = e; hasError = true; throw e; }
          finally {
            emit({
              t: new Date().toISOString(),
              provider: name,
              method: m,
              args: args.map(safe),
              result: hasError ? undefined : safe(result),
              error: hasError ? String(error) : undefined
            });
          }
        };
        wrapped.__peginWrapped = true;
        try { provider[m] = wrapped; } catch (e) {}
      })(method, fn);
    }
  }
  function scan() { for (var i = 0; i < PATHS.length; i++) wrap(resolve(PATHS[i]), PATHS[i]); }
  scan();
  setInterval(scan, 500);
})()`;

/**
 * Install the read-through signing capture (layer 3): expose a Node sink the page calls, then inject
 * the wrapper into BOTH the current page and every future navigation. Best-effort — a failure here is
 * logged and skipped, never fatal to the run (the peg-in matters more than the fixture).
 */
async function installSigningCapture(
  page: Page,
  signingLog: string,
  log: (m: string) => void,
): Promise<void> {
  try {
    await page.exposeFunction("__peginRecordSigning", (json: string) => {
      appendFileSync(signingLog, json + "\n");
    });
    // addInitScript for future navigations; evaluate for the already-loaded current page. Both take
    // the raw string so esbuild can't inject its `__name` helper (see SIGNING_CAPTURE_SOURCE).
    await page.addInitScript({ content: SIGNING_CAPTURE_SOURCE });
    await page.evaluate(SIGNING_CAPTURE_SOURCE);
    log(`Signing capture → ${signingLog}`);
  } catch (e) {
    log(`recorder: signing capture install failed (non-fatal): ${e}`);
  }
}

/** Whether a captured response body is textual (JSON/text) and safe to store verbatim. */
function isTextBody(response: Response): boolean {
  const type = (response.headers()["content-type"] ?? "").toLowerCase();
  return type.includes("json") || type.includes("text");
}

/** Declared body size from content-length, or null when the header is absent. */
function declaredSize(response: Response): number | null {
  const raw = response.headers()["content-length"];
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

/**
 * Start recording. `currentStep` is sampled per captured response so each fixture line is tagged with
 * the step it belongs to (a step index/label for pegin; an elapsed marker for the human-driven observe
 * run). Returns a `Recorder` whose `stop()` the caller MUST invoke (in a finally) to flush the trace.
 *
 * `captureSigning` (default off) enables layer 3 — the wallet signing capture. It's OPT-IN because it
 * writes real (testnet) message/psbt/psbts fixtures; only the `observe` run (which exists to build the
 * conformance fixtures) turns it on. A plain peg-in leaves it off to keep the sensitive-artifact
 * surface minimal. These are testnet artifacts with no key material, and `artifacts/` is gitignored.
 */
export async function startRecording(
  context: BrowserContext,
  page: Page,
  dir: string,
  log: (m: string) => void,
  currentStep: () => string = () => "",
  { captureSigning = false }: { captureSigning?: boolean } = {},
): Promise<Recorder> {
  const recordingDir = join(dir, "recording");
  mkdirSync(recordingDir, { recursive: true });
  const httpLog = join(recordingDir, "http.jsonl");
  const signingLog = join(recordingDir, "signing.jsonl");
  const tracePath = join(dir, "trace.zip");

  await context.tracing
    .start({ screenshots: true, snapshots: true, sources: true })
    .catch((e) => log(`recorder: tracing.start failed (non-fatal): ${e}`));

  // Layer 3 (opt-in): wrap the injected wallet provider's signing methods (read-through) to save the
  // real message/psbt/psbts fixtures for per-wallet conformance tests.
  if (captureSigning) {
    log(
      "⚠️ signing capture ON → recording/signing.jsonl will hold real testnet message/psbt/psbts + signatures (no keys). Gitignored; don't share broadly.",
    );
    await installSigningCapture(page, signingLog, log);
  }

  const onResponse = (response: Response) => {
    void (async () => {
      try {
        const request = response.request();
        if (!CAPTURED_RESOURCE_TYPES.has(request.resourceType())) return;

        const size = declaredSize(response);
        const tooBig = size !== null && size > MAX_CAPTURED_BODY_BYTES;
        let body: string | { truncated: true; size: number | null } | null =
          null;
        if (tooBig) {
          body = { truncated: true, size };
        } else if (isTextBody(response)) {
          const text = await response.text().catch(() => null);
          body =
            text !== null && text.length > MAX_CAPTURED_BODY_BYTES
              ? { truncated: true, size: text.length }
              : text;
        }

        const entry = {
          t: new Date().toISOString(),
          step: currentStep(),
          method: request.method(),
          url: response.url(),
          status: response.status(),
          reqBody: request.postData() ?? undefined,
          resBody: body ?? undefined,
        };
        appendFileSync(httpLog, JSON.stringify(entry) + "\n");
      } catch {
        // A response can be superseded/aborted before its body resolves — skip it, never crash the run.
      }
    })();
  };

  page.on("response", onResponse);
  log(`Recording → trace ${tracePath} + fixtures ${httpLog}`);

  let snapshotSeq = 0;
  return {
    snapshot: async (label: string) => {
      snapshotSeq += 1;
      const name = snapshotName(snapshotSeq, label);
      await captureSnapshot(page, recordingDir, name, log);
      appendNote(recordingDir, name, label, log);
    },
    stop: async () => {
      page.off("response", onResponse);
      await context.tracing
        .stop({ path: tracePath })
        .catch((e) => log(`recorder: tracing.stop failed (non-fatal): ${e}`));
      log(`Recording stopped → ${tracePath}`);
    },
  };
}
