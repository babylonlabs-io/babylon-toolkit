/**
 * Launch a headed persistent Chromium context with one or more wallet extensions loaded (but NOT
 * imported). Wallet specs call this, then run the per-wallet importers so they can capture the
 * imported address for assertion. Mirrors the launch options used by `setupExtensions.ts`, plus an
 * English-forcing `env` (MetaMask reads the OS locale, so a non-English OS otherwise yields a
 * non-English onboarding UI).
 *
 * `colorScheme: "dark"` emulates `prefers-color-scheme: dark` for every page in the context; wallet
 * extensions (and the dApp) whose theme is "System"/"Auto" follow it, so the whole session is dark.
 */
import { type BrowserContext, chromium } from "@playwright/test";

import { EXTENSION_CHROME_STORE_IDS, getExtensionPath } from "../setup/downloadExtensions";
import { EXTENSION_INIT_MS } from "../utils/timing";

export type SupportedWallet = keyof typeof EXTENSION_CHROME_STORE_IDS;

export interface LaunchOptions {
  /** Open the browser window maximized (full work area) with the page filling it. Opt-in so the
   *  wallet specs keep their default fixed viewport; the vault connect CLI turns this on. */
  maximize?: boolean;
}

export async function launchWalletContext(
  wallets: SupportedWallet[],
  options: LaunchOptions = {},
): Promise<BrowserContext> {
  const extensionPaths = wallets.map((w) => getExtensionPath(EXTENSION_CHROME_STORE_IDS[w]));
  const args = [
    `--disable-extensions-except=${extensionPaths.join(",")}`,
    `--load-extension=${extensionPaths.join(",")}`,
    "--lang=en-US",
    "--force-lang=en-US",
    "--accept-lang=en-US",
  ];
  if (options.maximize) args.push("--start-maximized", "--window-position=0,0");
  const context = await chromium.launchPersistentContext("", {
    headless: false,
    channel: "chromium",
    locale: "en-US",
    // Emulate a dark OS/browser theme so wallets (and the dApp) on their "System" theme render dark.
    colorScheme: "dark",
    // Force English UI regardless of the host OS locale (extensions like MetaMask read it).
    env: { ...process.env, LANG: "en_US.UTF-8", LANGUAGE: "en_US", LC_ALL: "en_US.UTF-8" },
    // With maximize, let the OS window drive the page size (fill the window) instead of the default.
    viewport: options.maximize ? null : undefined,
    args,
    permissions: ["clipboard-read", "clipboard-write"],
  });

  // A persistent context always opens with one initial about:blank page — reuse it (don't create a
  // second). Give the extensions a moment to initialize, then close any auto-opened onboarding tabs
  // so each importer starts from a known blank slate (it opens its own extension page). One
  // about:blank must remain, or closing the last page would close the browser.
  const blank = context.pages()[0] ?? (await context.newPage());
  await blank.goto("about:blank").catch(() => {});
  await new Promise((resolve) => setTimeout(resolve, EXTENSION_INIT_MS));
  for (const page of context.pages()) {
    if (page !== blank) await page.close().catch(() => {});
  }
  return context;
}
