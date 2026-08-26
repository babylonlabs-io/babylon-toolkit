/**
 * The "sign-conformance" action: replay the REAL signing fixtures captured from a UniSat peg-in
 * (`recording/signing.jsonl`) into ANOTHER BTC wallet (e.g. OKX) and assert each call produces a
 * signature — WITHOUT driving a full 30 min–2 hr peg-in per wallet.
 *
 * This works because every wallet imports the SAME mnemonic → same BTC key → same signet taproot
 * address, so the captured PSBTs' inputs (and the `toSignInputs[].publicKey`) belong to this wallet
 * too, and the captured `options` are already at the injected-provider boundary — the exact shape
 * OKX's `signPsbt(hex, {autoFinalized, toSignInputs})` / `signPsbts` / `signMessage(msg, type)` expect.
 * It signs but never broadcasts, so no funds move.
 *
 * Approvals are driven ACTIVELY: for each call we poll every open `chrome-extension://` window and
 * click its approve control until the call resolves. This is deliberately NOT the new-window-event
 * approver used elsewhere — OKX reuses ONE persistent approval window (and parses PSBTs for a few
 * seconds before its Confirm appears), so an event-driven approver misses approvals after the first.
 */
import type { BrowserContext, Page } from "@playwright/test";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import type { BtcWalletId } from "../config";
import {
  APPROVE_ROUND_MS,
  POPUP_OPEN_WAIT_MS,
  POST_CONNECT_SETTLE_MS,
  SIGN_CALL_TIMEOUT_MS,
} from "../timing";

import { sweepApprovals } from "./approver";
import { type Action, type ActionContext } from "./types";

/** The signing methods we replay (the three the dapp uses on the BTC wallet). */
const SIGNING_METHODS = ["signMessage", "signPsbt", "signPsbts"] as const;
type SigningMethod = (typeof SIGNING_METHODS)[number];

/** One captured signing call to replay. */
interface Fixture {
  method: SigningMethod;
  args: unknown[];
}

/**
 * Injected-provider path per BTC wallet (the object that actually exposes signMessage/signPsbt/…).
 * OKX namespaces per chain (`bitcoinSignet` for signet); UniSat is flat. A wallet not listed here
 * errors clearly rather than being guessed at.
 */
const PROVIDER_PATH: Partial<Record<BtcWalletId, string>> = {
  unisat: "unisat",
  okx: "okxwallet.bitcoinSignet",
};

/** Newest sibling `*-pegin/recording/signing.jsonl`, or the explicit `--fixtures` path. */
function resolveFixturesPath(
  artifactsDir: string,
  explicit: string | undefined,
): string {
  if (explicit) return explicit;
  const artifactsRoot = dirname(artifactsDir);
  const peginRuns = readdirSync(artifactsRoot)
    .filter((name) => name.endsWith("-pegin"))
    .sort()
    .reverse();
  for (const run of peginRuns) {
    const candidate = join(artifactsRoot, run, "recording", "signing.jsonl");
    try {
      readFileSync(candidate);
      return candidate;
    } catch {
      // no signing.jsonl in this run — try the next.
    }
  }
  throw new Error(
    `No signing fixtures found. Pass --fixtures=<path to signing.jsonl>, or run a pegin first (looked under ${artifactsRoot}/*-pegin/recording/signing.jsonl).`,
  );
}

/** Parse signing.jsonl into replayable fixtures (skip errored + non-signing entries). */
function loadFixtures(path: string, log: (m: string) => void): Fixture[] {
  const fixtures: Fixture[] = [];
  for (const line of readFileSync(path, "utf8").split("\n")) {
    if (!line.trim()) continue;
    const entry = JSON.parse(line) as {
      method?: string;
      args?: unknown[];
      error?: string;
    };
    if (entry.error) continue;
    if (!SIGNING_METHODS.includes(entry.method as SigningMethod)) continue;
    if (!Array.isArray(entry.args)) continue;
    fixtures.push({ method: entry.method as SigningMethod, args: entry.args });
  }
  log(`Loaded ${fixtures.length} signing fixtures from ${path}`);
  return fixtures;
}

/** The depositor pubkey the fixtures were built for — used to warn on an account/network mismatch. */
function fixturePublicKey(fixtures: Fixture[]): string | undefined {
  for (const f of fixtures) {
    const opts =
      f.method === "signPsbts" ? (f.args[1] as unknown[])?.[0] : f.args[1];
    const toSign = (opts as { toSignInputs?: { publicKey?: string }[] })
      ?.toSignInputs;
    if (toSign?.[0]?.publicKey) return toSign[0].publicKey;
  }
  return undefined;
}

/** Human-readable one-liner for a fixture (no raw hex spam). */
function describeFixture(f: Fixture): string {
  const a0 = f.args[0];
  if (f.method === "signMessage")
    return `signMessage type=${JSON.stringify(f.args[1])} (${String(a0).length} chars)`;
  if (f.method === "signPsbt")
    return `signPsbt (${String(a0).length}-char psbt)`;
  return `signPsbts (${Array.isArray(a0) ? a0.length : "?"} psbts)`;
}

/** Whether a returned signature has the right SHAPE for the method (non-empty / right arity). */
function isValidResult(
  method: SigningMethod,
  result: unknown,
  args: unknown[],
): boolean {
  if (method === "signPsbts") {
    const expected = Array.isArray(args[0]) ? args[0].length : -1;
    return (
      Array.isArray(result) &&
      result.length === expected &&
      result.every((r) => typeof r === "string" && r.length > 0)
    );
  }
  return typeof result === "string" && result.length > 0;
}

function summarizeResult(result: unknown): string {
  if (Array.isArray(result))
    return `array[${result.length}] (elem0 ${String(result[0] ?? "").length} chars)`;
  return `string ${String(result ?? "").length} chars`;
}

/** Reject if `promise` doesn't settle within `ms` (an approval that never resolved). */
function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  label: string,
): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(
        () =>
          reject(
            new Error(
              `${label} did not resolve within ${ms}ms (not confirmed?)`,
            ),
          ),
        ms,
      ),
    ),
  ]);
}

/**
 * Call a wallet provider method (or `__connect`) in the page and return its result. Anonymous arrow
 * with no nested named declarations — safe to pass to `page.evaluate` (a named/nested function would
 * be rewritten with esbuild's `__name` helper, which is undefined in the browser page).
 */
function callProvider(
  page: Page,
  providerPath: string,
  method: string,
  args: unknown[],
): Promise<unknown> {
  return page.evaluate(
    async ({ providerPath, method, args }) => {
      let provider: unknown = window;
      for (const key of providerPath.split(".")) {
        provider =
          provider == null
            ? provider
            : (provider as Record<string, unknown>)[key];
      }
      if (provider == null)
        throw new Error(`provider not found at window.${providerPath}`);
      const p = provider as Record<
        string,
        (...a: unknown[]) => Promise<unknown>
      >;
      if (method === "__connect") {
        if (typeof p.connect === "function") return await p.connect();
        if (typeof p.requestAccounts === "function")
          return await p.requestAccounts();
        throw new Error(
          "provider exposes neither connect() nor requestAccounts()",
        );
      }
      if (typeof p[method] !== "function")
        throw new Error(`provider has no method ${method}`);
      return await p[method](...args);
    },
    { providerPath, method, args },
  );
}

/** Close any leftover extension pop-ups so a failed call can't leak a modal into the next one. */
async function closeStrayPopups(
  context: BrowserContext,
  mainPage: Page,
): Promise<void> {
  for (const pg of context.pages()) {
    if (pg !== mainPage && pg.url().startsWith("chrome-extension://"))
      await pg.close().catch(() => {});
  }
}

/**
 * Drive approvals for an in-flight provider call: poll every open extension window and click its
 * approve control each round until `isStopped()` (the call settled). Handles OKX's reused approval
 * window (no new-`page` event) and its multi-second PSBT parse (the Confirm appears late — polling
 * simply clicks it once it's live). Best-effort; never throws.
 */
async function driveApprovals(
  context: BrowserContext,
  mainPage: Page,
  isStopped: () => boolean,
  log: (m: string) => void,
): Promise<void> {
  // Let the approval UI render (OKX parses PSBTs first) before the first pass.
  await mainPage.waitForTimeout(POPUP_OPEN_WAIT_MS).catch(() => {});
  while (!isStopped()) {
    await sweepApprovals(context, mainPage, log);
    await mainPage.waitForTimeout(APPROVE_ROUND_MS).catch(() => {});
  }
}

/** Run one provider call while actively driving its approvals; returns the call's result. */
async function callWithApprovals(
  context: BrowserContext,
  page: Page,
  label: string,
  call: Promise<unknown>,
  log: (m: string) => void,
): Promise<unknown> {
  const settled = withTimeout(call, SIGN_CALL_TIMEOUT_MS, label);
  let stopped = false;
  const driver = driveApprovals(context, page, () => stopped, log);
  try {
    return await settled;
  } finally {
    stopped = true;
    await driver;
  }
}

interface FixtureResult {
  label: string;
  method: SigningMethod;
  ok: boolean;
  detail: string;
}

export const signConformanceAction: Action = {
  id: "sign-conformance",
  async run(ctx: ActionContext): Promise<void> {
    const { page, context, log, artifactsDir, config } = ctx;
    const btcId = ctx.btc.id;
    const providerPath = PROVIDER_PATH[btcId];
    if (!providerPath)
      throw new Error(
        `sign-conformance: injected-provider path not defined for "${btcId}" (supported: ${Object.keys(PROVIDER_PATH).join(", ")}).`,
      );

    const fixtures = loadFixtures(
      resolveFixturesPath(artifactsDir, config.fixturesPath),
      log,
    );
    if (fixtures.length === 0)
      throw new Error(
        "sign-conformance: no replayable signing fixtures found.",
      );

    // Establish the wallet↔page connection (its approval is driven like any other call).
    log(`Connecting ${btcId} via window.${providerPath}`);
    const connection = (await callWithApprovals(
      context,
      page,
      "connect",
      callProvider(page, providerPath, "__connect", []),
      log,
    )) as { address?: string; compressedPublicKey?: string } | string[];
    log(`Connected: ${JSON.stringify(connection).slice(0, 200)}`);

    // Warn early if the connected account can't own the fixtures' inputs (wrong network/address) —
    // signing would then fail for a reason unrelated to the wallet's approval UI.
    const expectedPk = fixturePublicKey(fixtures);
    const connectedPk = Array.isArray(connection)
      ? undefined
      : connection.compressedPublicKey;
    if (expectedPk && connectedPk && connectedPk !== expectedPk)
      log(
        `⚠️ connected pubkey ${connectedPk} ≠ fixture pubkey ${expectedPk} — the wallet is on a different account/network; signing will likely fail`,
      );

    // Let the dapp finish any post-connection navigation before driving provider calls, so an
    // in-flight signing evaluate isn't destroyed mid-call by a late SPA route change.
    await page.waitForTimeout(POST_CONNECT_SETTLE_MS);

    const results: FixtureResult[] = [];
    for (let i = 0; i < fixtures.length; i++) {
      const f = fixtures[i];
      const label = `${String(i + 1).padStart(2, "0")}-${f.method}`;
      log(`\n▶ ${label}: ${describeFixture(f)}`);
      try {
        const result = await callWithApprovals(
          context,
          page,
          label,
          callProvider(page, providerPath, f.method, f.args),
          log,
        );
        const ok = isValidResult(f.method, result, f.args);
        const detail = summarizeResult(result);
        log(
          ok
            ? `  ✅ signed → ${detail}`
            : `  ⚠️ returned but wrong shape → ${detail}`,
        );
        results.push({ label, method: f.method, ok, detail });
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        log(`  ❌ ${detail}`);
        results.push({ label, method: f.method, ok: false, detail });
        await closeStrayPopups(context, page);
      }
    }

    writeFileSync(
      join(artifactsDir, "conformance-results.json"),
      JSON.stringify({ wallet: btcId, providerPath, results }, null, 2),
    );
    const passed = results.filter((r) => r.ok).length;
    log(`\nSign-conformance (${btcId}): ${passed}/${results.length} signed.`);
    if (passed !== results.length)
      throw new Error(
        `sign-conformance: ${results.length - passed}/${results.length} fixture(s) failed for ${btcId}.`,
      );
    log(`✅ ${btcId} signed every fixture shape (message + psbt + psbts).`);
  },
};
