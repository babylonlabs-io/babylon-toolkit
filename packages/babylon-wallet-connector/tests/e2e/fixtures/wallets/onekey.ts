/**
 * OneKey wallet importer for real-extension E2E.
 *
 * Imports a mnemonic, switches OneKey's network to **Bitcoin Signet**, disables "BTC multiple
 * addresses", then returns the active receive (taproot) address for the spec to assert against
 * `deriveSignetTaproot(mnemonic)`.
 *
 * Hard-won gotchas (OneKey 6.4.0):
 *  - The provider refuses to connect to a dApp while "BTC multiple addresses" (fresh address per tx)
 *    is on — `connectWallet` throws "requires single address mode" — so we disable it after import.
 *  - Onboarding runs in the full-page tab `ui-expand-tab.html`; OneKey renders it in English already,
 *    so there's no in-app language switch (unlike OKX). We still drive by `data-testid` where possible.
 *  - The 12 seed inputs (`phrase-input-index0..11`) each show an autocomplete popup and do NOT
 *    auto-advance, so typing word-by-word is fragile. OneKey fans a single paste across all 12 fields,
 *    so we write the phrase to the clipboard and paste into box 0, then clear the clipboard.
 *  - After the passcode screen OneKey shows "Your wallet is ready" (→ Enter wallet) and then a
 *    referral-code modal (→ Skip) before landing on the wallet home.
 *  - The network selector trigger (the chain-icon cluster, "+16", next to "Account #1") carries no
 *    testid — it's targeted by its `data-sentry-source-file` marker (AllNetworksManagerTrigger).
 *  - The wallet home never renders our own receive address (the visible `tb1p…` values are tx-history
 *    targets), so there's no on-screen truncation to cross-check. Instead we clear the clipboard, click
 *    copy, and poll until it becomes a valid `tb1p…` — a stale value would still read empty and be rejected.
 */
import { type BrowserContext, type Page } from "@playwright/test";

import { EXTENSION_CHROME_STORE_IDS } from "../../setup/downloadExtensions";
import { runtimeExtensionId } from "../../utils/extensionId";
import { CLIPBOARD_POLL, SETTLE, WAIT_FOR } from "../../utils/timing";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Full signet taproot receive address (bech32m), used to validate what we read from OneKey. */
const FULL_SIGNET_TAPROOT = /^tb1p[0-9a-z]{50,}$/;

/**
 * Close every page except our OneKey tab and any about:blank, leaving a blank tab as a safety net so
 * the browser never closes when the last real page goes away.
 */
async function closeForeignTabs(context: BrowserContext, tab: Page): Promise<void> {
  for (const page of context.pages()) {
    if (page === tab || page.isClosed() || page.url() === "about:blank") continue;
    await page.close().catch(() => {});
  }
}

/** Force-click a top-document element by testid, waiting for it to appear first. */
async function clickByTestId(tab: Page, testid: string, timeout: number = WAIT_FOR.ELEMENT_SLOW_MS): Promise<void> {
  const loc = tab.locator(`[data-testid="${testid}"]`).first();
  await loc.waitFor({ state: "visible", timeout }).catch(() => {});
  await loc.click({ force: true, timeout: WAIT_FOR.ACTION_MS }).catch(() => {});
}

/** Force-click an element by its (exact) visible text, waiting for it first. */
async function clickByText(tab: Page, text: string, timeout: number = WAIT_FOR.ELEMENT_SLOW_MS): Promise<void> {
  const loc = tab.getByText(text, { exact: true }).first();
  await loc.waitFor({ state: "visible", timeout }).catch(() => {});
  await loc.click({ force: true, timeout: WAIT_FOR.ACTION_MS }).catch(() => {});
}

/** Switch the active network to Bitcoin Signet via the chain-cluster trigger → Single network → search. */
async function switchToSignet(tab: Page): Promise<void> {
  // The chain-icon cluster ("+16") next to "Account #1" has no testid — target its source-file marker.
  await tab.locator('[data-sentry-source-file*="AllNetworksManagerTrigger"]').first().click({ force: true }).catch(() => {});
  await sleep(SETTLE.MODAL);
  await clickByText(tab, "Single network");
  await sleep(SETTLE.SHORT);
  const search = tab.locator('[data-testid="nav-header-search-chain-selector-search-bar"]').first();
  await search.waitFor({ state: "visible", timeout: WAIT_FOR.ELEMENT_MS }).catch(() => {});
  await search.fill("signet").catch(() => {});
  await sleep(SETTLE.MODAL);
  await clickByText(tab, "Bitcoin Signet");
  await sleep(SETTLE.MEDIUM);
}

/**
 * Disable "BTC multiple addresses" (a fresh receive address per transaction). OneKey's provider
 * refuses to connect to a dApp while this is on — `connectWallet` throws "OneKey Wallet requires
 * single address mode" — so real E2E connect fails without this step. Idempotent: only toggles when
 * the switch is currently on.
 *
 * Path in the full-page (ui-expand-tab) layout: the MENU is the dot-grid at the BOTTOM of the left
 * sidebar (`bottom-menu-container`), NOT a header button. It opens a menu with Settings, whose panel
 * has a "Wallet" tab (`…-item-WalletSolid` — distinct from the sidebar's own Wallet4Solid item) that
 * reveals the switch.
 */
async function disableBtcMultipleAddresses(tab: Page): Promise<void> {
  // Fail loudly and specifically: if any step breaks, the dApp connect otherwise dies later with a
  // generic "OneKey Wallet requires single address mode" that hides which setup step actually broke.
  const fail = (step: string): never => {
    throw new Error(
      `OneKey setup: could not disable "BTC multiple addresses" — ${step}. Without this the dApp connect ` +
        `fails with "OneKey Wallet requires single address mode". The OneKey settings UI likely changed; ` +
        `re-derive the selectors in disableBtcMultipleAddresses (onekey.ts).`,
    );
  };

  const menu = tab.locator('[data-testid="bottom-menu-container"]').first();
  if (!(await menu.isVisible().catch(() => false))) fail("the sidebar MENU (bottom-menu-container) was not found");
  await menu.click({ force: true }).catch(() => {});
  await sleep(SETTLE.MODAL);
  await clickByText(tab, "Settings");
  await sleep(SETTLE.MEDIUM);

  // Settings-panel "Wallet" tab; the suffix match covers both its active and inactive testid variants.
  const walletTab = tab.locator('[data-testid$="-item-WalletSolid"]').first();
  if (!(await walletTab.isVisible().catch(() => false))) fail('the Settings → "Wallet" tab was not found');
  await walletTab.click({ force: true }).catch(() => {});
  await sleep(SETTLE.MEDIUM);

  const toggle = tab.locator('[data-testid="setting-toggle-b-t-c-fresh-address-switch"]').first();
  if (!(await toggle.isVisible().catch(() => false))) fail('the "BTC multiple addresses" toggle was not found');
  if ((await toggle.getAttribute("aria-checked").catch(() => null)) === "true") {
    await toggle.click({ force: true }).catch(() => {});
    await sleep(SETTLE.SHORT);
  }
  // Verify the outcome — a silent no-op here is exactly what caused confusing downstream failures.
  if ((await toggle.getAttribute("aria-checked").catch(() => null)) !== "false") {
    fail("the toggle did not switch to single-address mode");
  }
}

/**
 * Read the active receive address by clicking the header copy button and reading the clipboard.
 * Clearing the clipboard first and polling until a valid taproot appears rejects any stale value.
 */
async function readAddress(tab: Page): Promise<string | null> {
  await tab.evaluate("navigator.clipboard.writeText('').catch(() => {})").catch(() => {});
  await clickByTestId(tab, "account-selector-copy-address-btn");

  let clip = "";
  for (let i = 0; i < CLIPBOARD_POLL.ATTEMPTS; i++) {
    clip = (((await tab.evaluate("navigator.clipboard.readText().catch(() => '')").catch(() => "")) as string) || "").trim();
    if (FULL_SIGNET_TAPROOT.test(clip)) return clip;
    await sleep(CLIPBOARD_POLL.INTERVAL_MS);
  }
  return null;
}

/**
 * Import `mnemonic` into OneKey and return the active Bitcoin Signet taproot (`tb1p…`) address.
 * The extension must already be loaded into `context` (see `launchWalletContext`).
 */
export async function setupOneKeyWallet(context: BrowserContext, mnemonic: string, password: string): Promise<string> {
  if (!mnemonic) throw new Error("Missing E2E_WALLET_MNEMONIC");
  if (!password) throw new Error("Missing E2E_WALLET_PASSWORD");

  const oneKeyId = runtimeExtensionId(EXTENSION_CHROME_STORE_IDS.ONEKEY);
  const origin = `chrome-extension://${oneKeyId}`;

  // Full-page onboarding tab.
  const tab = await context.newPage();
  await tab.goto(`${origin}/ui-expand-tab.html`).catch(() => {});
  await tab.waitForLoadState("domcontentloaded").catch(() => {});
  await sleep(SETTLE.EXTRA_LONG);
  await closeForeignTabs(context, tab);

  // Add existing wallet → import phrase or private key. The tile has no testid, so click by text.
  await clickByText(tab, "Add existing wallet");
  await sleep(SETTLE.MEDIUM);
  await clickByTestId(tab, "onboarding-create-or-import-wallet-option-phraseOrPrivateKey-btn");
  await sleep(SETTLE.MEDIUM);

  // Fill the 12 seed words by pasting into box 0 (OneKey fans it across all inputs); clear the clipboard.
  const seedBox = tab.locator('[data-testid="phrase-input-index0"]').first();
  await seedBox.waitFor({ state: "visible", timeout: WAIT_FOR.ELEMENT_SLOW_MS }).catch(() => {});
  await tab.evaluate((m) => navigator.clipboard.writeText(m).catch(() => {}), mnemonic.trim()).catch(() => {});
  await seedBox.click().catch(() => {});
  await tab.keyboard.press("ControlOrMeta+V").catch(() => {});
  await sleep(SETTLE.SHORT);
  await tab.evaluate("navigator.clipboard.writeText('').catch(() => {})").catch(() => {});
  await sleep(SETTLE.SHORT);
  await clickByTestId(tab, "onboarding-import-phrase-confirm-btn");
  await sleep(SETTLE.LONG);

  // Set passcode: fill both fields, submit.
  await tab.locator('[data-testid="password"]').first().fill(password).catch(() => {});
  await tab.locator('[data-testid="confirm-password"]').first().fill(password).catch(() => {});
  await sleep(SETTLE.SHORT);
  await clickByTestId(tab, "set-password");
  await sleep(SETTLE.PROCESSING);

  // "Your wallet is ready" → Enter wallet → skip the referral-code modal.
  await clickByText(tab, "Enter wallet");
  await sleep(SETTLE.LONG);
  await clickByText(tab, "Skip");
  await sleep(SETTLE.EXTRA_LONG);

  // Wait for the wallet home, then switch to signet and read the address.
  await tab.locator('[data-testid="AccountSelectorTriggerBase"]').first().waitFor({ state: "visible", timeout: WAIT_FOR.HOME_MS }).catch(() => {});
  await switchToSignet(tab);

  // Read the receive address on the wallet home FIRST, then disable multiple addresses (which
  // navigates into Settings and away from the home screen where readAddress works). Reading here is
  // safe: the spec asserts the returned address equals deriveSignetTaproot(mnemonic), so if OneKey ever
  // surfaced a fresh/first-unused address while multi-address is on, that assertion would fail loudly.
  const address = await readAddress(tab);
  await disableBtcMultipleAddresses(tab);
  await closeForeignTabs(context, tab);
  await tab.close().catch(() => {}); // done — the wallet persists in the profile

  if (!address) throw new Error("OneKey: could not read a signet taproot address after import");
  return address;
}
