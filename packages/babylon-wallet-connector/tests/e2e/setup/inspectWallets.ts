/**
 * Headed wallet inspector / dev tool (NOT a Playwright spec).
 *
 * Two modes:
 *  1. Production wallets (UNISAT, METAMASK): runs the real importer from `fixtures/wallets/*` headed
 *     so you can watch the flow and see the address verdict. The importers are the single source of
 *     truth — this tool just drives them.
 *  2. Prototype mode (any wallet without an importer yet, e.g. OKX/ONEKEY): loads the extension,
 *     discovers its runtime id, opens its entry page, and dumps a screenshot + DOM snapshot so you
 *     can derive selectors, then write `fixtures/wallets/<wallet>.ts`.
 *
 * Secrets: reads E2E_WALLET_MNEMONIC / E2E_WALLET_PASSWORD from env; never logs them.
 *
 * Usage:  SHOT_DIR=/dir tsx tests/e2e/setup/inspectWallets.ts UNISAT
 */
import { type BrowserContext, chromium, type Page } from "@playwright/test";

import { launchWalletContext, type SupportedWallet } from "../fixtures/launch";
import { setupMetaMaskWallet } from "../fixtures/wallets/metamask";
import { setupOKXWallet } from "../fixtures/wallets/okx";
import { setupOneKeyWallet } from "../fixtures/wallets/onekey";
import { setupUnisatWallet } from "../fixtures/wallets/unisat";
import { pathToExtensionId } from "../utils/extensionId";
import { addrMatches } from "../utils/walletUi";

import { EXTENSION_CHROME_STORE_IDS, getExtensionPath } from "./downloadExtensions";
import { deriveEthAddress } from "./eth";
import { deriveSignetTaproot } from "./taproot";

const SHOT_DIR = process.env.SHOT_DIR || "/tmp";
const WALLET = (process.argv[2] || "UNISAT") as SupportedWallet;
// INSPECT_MNEMONIC lets you override the real seed with a throwaway one. No address is hardcoded:
// the expected address is computed from whatever mnemonic is used.
const MNEMONIC = process.env.INSPECT_MNEMONIC || process.env.E2E_WALLET_MNEMONIC || "";
const PASSWORD = process.env.E2E_WALLET_PASSWORD || "";

/** Production importers, keyed by wallet. Each imports the mnemonic and returns the read address. */
const IMPORTERS: Partial<Record<SupportedWallet, (c: BrowserContext, m: string, p: string) => Promise<string>>> = {
  UNISAT: setupUnisatWallet,
  METAMASK: setupMetaMaskWallet,
  OKX: setupOKXWallet,
  ONEKEY: setupOneKeyWallet,
};

const EXPECTED = !MNEMONIC ? null : WALLET === "METAMASK" ? deriveEthAddress(MNEMONIC) : deriveSignetTaproot(MNEMONIC);

/** Discover a loaded extension's runtime id by scanning for chrome-extension:// targets (prototype
 * mode only — importers use the deterministic path hash instead, which is multi-extension-safe). */
async function discoverRuntimeId(context: BrowserContext, timeoutMs = 15000): Promise<string | null> {
  const deadline = Date.now() + timeoutMs;
  const extract = (): string | null => {
    const urls = [
      ...context.serviceWorkers().map((w) => w.url()),
      ...context.backgroundPages().map((p) => p.url()),
      ...context.pages().map((p) => p.url()),
    ];
    for (const u of urls) {
      const m = u.match(/^chrome-extension:\/\/([a-p]{32})\//);
      if (m) return m[1];
    }
    return null;
  };
  let id = extract();
  while (!id && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 500));
    id = extract();
  }
  return id;
}

/** Broad, self-healing snapshot: short visible texts (button-ish) + visible inputs. */
async function describe(page: Page) {
  // tsx/esbuild injects a `__name` helper into functions passed to page.evaluate that does not
  // exist in the browser context. Shim it (as a raw string, so esbuild won't transform it).
  await page.evaluate("globalThis.__name = globalThis.__name || function (f) { return f; };").catch(() => {});
  return page.evaluate(() => {
    const visible = (el: Element) => {
      const r = el.getBoundingClientRect();
      const s = getComputedStyle(el as HTMLElement);
      return r.width > 0 && r.height > 0 && s.visibility !== "hidden" && s.display !== "none";
    };
    const texts = Array.from(document.querySelectorAll("button,a,[role=button],div,span,p,h1,h2"))
      .filter(visible)
      .map((el) => (el.textContent || "").trim().replace(/\s+/g, " "))
      .filter((t) => t.length > 0 && t.length < 45);
    const inputs = Array.from(document.querySelectorAll("input,textarea"))
      .filter(visible)
      .map((el) => {
        const i = el as HTMLInputElement;
        return { type: i.type || el.tagName.toLowerCase(), placeholder: i.placeholder || undefined };
      });
    return { texts: [...new Set(texts)].slice(0, 25), inputs };
  });
}

async function snap(page: Page, label: string) {
  const file = `${SHOT_DIR}/${WALLET.toLowerCase()}-${label}.png`;
  await page.screenshot({ path: file }).catch((e) => console.log(`  (screenshot failed: ${e.message})`));
  console.log(`  📸 ${file}`);
  let dom = "(unavailable)";
  try {
    dom = JSON.stringify(await describe(page));
  } catch (e) {
    dom = `(DOM dump unavailable: ${(e as Error).message.slice(0, 60)})`;
  }
  console.log(`  DOM: ${dom}`);
}

async function main() {
  const storeId = EXTENSION_CHROME_STORE_IDS[WALLET];
  const extPath = getExtensionPath(storeId);

  console.log(`\n=== Inspecting ${WALLET} ===`);
  console.log(`store id            : ${storeId}`);
  console.log(`load path           : ${extPath}`);
  console.log(`predicted runtime id: ${pathToExtensionId(extPath)}   (Chromium path→id hash)`);

  const importer = IMPORTERS[WALLET];
  if (importer && MNEMONIC && PASSWORD) {
    // Mode 1: run the production importer headed and print the address verdict.
    const context = await launchWalletContext([WALLET]);
    try {
      const address = await importer(context, MNEMONIC, PASSWORD);
      const verdict = addrMatches(address, EXPECTED) ? "MATCH ✅" : "MISMATCH ❌";
      console.log(`\n  address : ${address}`);
      console.log(`  expected: ${EXPECTED}`);
      console.log(`  verdict : ${verdict}`);
      console.log("\nKeeping browser open 8s so you can observe...");
      await new Promise((r) => setTimeout(r, 8000));
    } catch (e) {
      console.log(`importer error: ${(e as Error).message}`);
    } finally {
      await context.close();
    }
    return;
  }

  // Mode 2: prototype a new wallet — load it, discover its runtime id, open its entry, dump DOM.
  if (!MNEMONIC || !PASSWORD) {
    console.log("⚠️  E2E_WALLET_MNEMONIC / E2E_WALLET_PASSWORD not set — opening onboarding only.");
  }
  const context = await chromium.launchPersistentContext("", {
    headless: false,
    channel: "chromium",
    locale: "en-US",
    env: { ...process.env, LANG: "en_US.UTF-8", LANGUAGE: "en_US", LC_ALL: "en_US.UTF-8" },
    args: [
      `--disable-extensions-except=${extPath}`,
      `--load-extension=${extPath}`,
      "--lang=en-US",
      "--accept-lang=en-US",
    ],
    permissions: ["clipboard-read", "clipboard-write"],
  });

  const runtimeId = await discoverRuntimeId(context);
  console.log(`observed runtime id : ${runtimeId}`);
  if (!runtimeId) {
    await new Promise((r) => setTimeout(r, 10000));
    await context.close();
    return;
  }

  await new Promise((r) => setTimeout(r, 3000));
  let page = context.pages().find((p) => p.url().startsWith(`chrome-extension://${runtimeId}`));
  if (!page) {
    page = await context.newPage();
    await page.goto(`chrome-extension://${runtimeId}/index.html`).catch((e) => console.log(`goto: ${e.message}`));
  }
  await page.waitForLoadState("domcontentloaded").catch(() => {});
  await page.waitForTimeout(2000);
  await page.bringToFront();
  console.log(`\nentry: ${page.url()}`);
  await snap(page, "1-welcome");
  console.log(
    "\nPrototype mode: no importer for this wallet yet. Derive selectors from the screenshot + DOM " +
      "dump above, then add tests/e2e/fixtures/wallets/<wallet>.ts and register it in IMPORTERS.",
  );
  console.log("Keeping browser open 20s so you can observe...");
  await new Promise((r) => setTimeout(r, 20000));
  await context.close();
  console.log("Done.");
}

main().catch((e) => {
  console.error("inspectWallets failed:", e);
  process.exit(1);
});
