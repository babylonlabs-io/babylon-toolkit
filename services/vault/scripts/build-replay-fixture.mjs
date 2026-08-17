#!/usr/bin/env node
/**
 * Derives the committed replay fixture from a raw run recording.
 *
 * The raw recordings under `e2e/artifacts` are gitignored - they are transient
 * output of a real devnet run, they are megabytes, and they contain the whole
 * flow including the depositor auth-token exchange. The visual capture needs a
 * small, committed, secret-free subset of one, and this is what produces it.
 *
 * Two reductions, both of which matter:
 *
 *  - **Cut at a step.** A run is a moving picture; a screenshot needs one
 *    moment. Cutting at `deposit-form` also happens to end the file before
 *    `auth_createDepositorToken`, so no session token is carried into the
 *    repository - that is a property to preserve, not a coincidence to rely
 *    on, which is why the scrub below runs regardless.
 *  - **Drop what the app does not read.** Sentry envelopes, the AppKit asset
 *    CDN, the dApp's own origin. None are replayed, and they are most of the
 *    bytes.
 *
 * Usage:
 *   node scripts/build-replay-fixture.mjs \
 *     e2e/artifacts/<run>/recording/http.jsonl \
 *     [--step deposit-form]
 */

import fs from "node:fs";
import path from "node:path";
import process from "node:process";

// The loader's own policy, imported rather than restated. This script used to
// carry a second copy that matched bare labels where the loader matches
// domains, and the two had already drifted apart on `walletconnect.com` and
// `web3modal.com`. Node strips the types on import; `recording.ts` is a leaf
// module with no relative imports, which is what makes that work.
import { isDroppedHost } from "../e2e/fixtures/replay/recording.ts";

/** Where the committed fixture lives - beside the code that loads it. */
const OUTPUT = path.join(
  import.meta.dirname,
  "../e2e/fixtures/replay/recorded-run.jsonl",
);

/** The step the fixture is cut at. See `recording.ts`. */
const DEFAULT_STEP = "deposit-form";

/**
 * Belt and braces over the step cut: refuse to emit anything that smells like
 * a credential, wherever it came from. The cut is what makes this unnecessary
 * today; this is what stops a future cut at a later step from quietly
 * committing a bearer token.
 */
const SECRET_PATTERNS = [
  /bearer\s+[\w.-]+/i,
  /"authorization"/i,
  /createDepositorToken/,
  /mnemonic/i,
  /private[_-]?key/i,
];

function main() {
  const [source, ...rest] = process.argv.slice(2);
  if (!source) {
    console.error(
      "usage: build-replay-fixture.mjs <recording.jsonl> [--step <name>]",
    );
    process.exit(1);
  }
  const stepFlag = rest.indexOf("--step");
  const step = stepFlag === -1 ? DEFAULT_STEP : rest[stepFlag + 1];

  const lines = fs
    .readFileSync(source, "utf8")
    .split("\n")
    .filter((line) => line.trim() !== "")
    .map((line) => JSON.parse(line));

  const cutoff = lines.map((entry) => entry.step).lastIndexOf(step);
  if (cutoff === -1) {
    console.error(
      `${source} has no exchange recorded during step "${step}". It contains: ` +
        [...new Set(lines.map((entry) => entry.step))].join(", "),
    );
    process.exit(1);
  }

  const kept = lines
    .slice(0, cutoff + 1)
    .filter((entry) => !isDroppedHost(new URL(entry.url).hostname));

  const offending = kept.filter((entry) =>
    SECRET_PATTERNS.some((pattern) => pattern.test(JSON.stringify(entry))),
  );
  if (offending.length > 0) {
    console.error(
      `Refusing to write: ${offending.length} exchange(s) look like they ` +
        `carry a credential. First: ${offending[0].method} ${offending[0].url}`,
    );
    process.exit(1);
  }

  const body = kept.map((entry) => JSON.stringify(entry)).join("\n") + "\n";
  fs.writeFileSync(OUTPUT, body);
  console.log(
    `Wrote ${path.relative(process.cwd(), OUTPUT)}: ${kept.length} exchanges, ` +
      `${(Buffer.byteLength(body) / 1024).toFixed(0)}KB, cut at "${step}" ` +
      `(from ${lines.length} recorded).`,
  );
}

main();
