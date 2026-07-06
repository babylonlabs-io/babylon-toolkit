/**
 * OKX wallet importer for real-extension E2E.
 *
 * Imports a mnemonic, switches OKX's UI to English and the network to **Bitcoin Signet**, then returns
 * the active receive address for the spec to assert against `deriveSignetTaproot(mnemonic)`.
 *
 * Hard-won gotchas (OKX 4.6.6 — see the git history of `setup/inspectWallets.ts` for the reverse-eng):
 *  - OKX ignores every browser locale signal (navigator.language / chrome.i18n / --lang / Accept-Language
 *    are all en-US) and renders in the host OS locale. So we drive by `data-testid` (language-agnostic)
 *    and flip OKX's own language to English as an explicit step.
 *  - Onboarding must run in a full-page TAB (`home.html`), not the small `popup.html` — the popup delegates
 *    seed entry to a separate modal WINDOW. We navigate the tab straight to the seed route to stay inline.
 *  - The onboarding UI (seed, password) renders inside an `<iframe src="ses.html…">`; the top document sees
 *    nothing, so those steps target the ses frame. The welcome screen renders outside it, so that step
 *    scans all frames.
 *  - OKX auto-opens a web3.okx.com marketing tab (and sometimes a modal window) — we close everything but
 *    our tab and any about:blank.
 *  - On Bitcoin Signet the Taproot address is already the preferred/default one, so no address-type switch
 *    is needed; the default matches the BIP86 taproot derivation.
 */
import { type BrowserContext, type Frame, type Page } from "@playwright/test";

import { EXTENSION_CHROME_STORE_IDS } from "../../setup/downloadExtensions";
import { runtimeExtensionId } from "../../utils/extensionId";
import { CLIPBOARD_POLL, ENGLISH_PACK_POLL_ATTEMPTS, SETTLE, WAIT_FOR } from "../../utils/timing";
import { addrMatches } from "../../utils/walletUi";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Full signet taproot receive address (bech32m), used to validate what we read from OKX. */
const FULL_SIGNET_TAPROOT = /^tb1p[0-9a-z]{50,}$/;

/**
 * Close every page except our OKX tab and any about:blank: kills OKX's web3.okx.com marketing tab and any
 * modal window it spawns, while leaving a blank tab as a safety net so the browser never closes.
 */
async function closeForeignTabs(context: BrowserContext, tab: Page): Promise<void> {
  for (const page of context.pages()) {
    if (page === tab || page.isClosed() || page.url() === "about:blank") continue;
    await page.close().catch(() => {});
  }
}

/** The currently-live OKX onboarding iframe (`ses.html`); optionally require its route to include `needle`. */
function sesFrame(tab: Page, needle?: string): Frame | undefined {
  return tab.frames().find((f) => f.url().includes("ses.html") && (!needle || f.url().includes(needle)));
}

/** Force-click a top-document element by testid, waiting for it to appear first (OKX icons are divs). */
async function clickByTestId(tab: Page, testid: string): Promise<void> {
  const loc = tab.locator(`[data-testid="${testid}"]`).first();
  await loc.waitFor({ state: "visible", timeout: WAIT_FOR.ELEMENT_SLOW_MS }).catch(() => {});
  await loc.click({ force: true, timeout: WAIT_FOR.ACTION_MS }).catch(() => {});
}

/** Click the last enabled <button> inside a frame (the primary "Next"/"Confirm" action). */
async function clickPrimaryButton(frame: Frame): Promise<void> {
  const btn = frame.locator("button:not([disabled])").last();
  if ((await btn.count().catch(() => 0)) > 0) await btn.click({ force: true }).catch(() => {});
}

/**
 * OKX intermittently shows a promo/warning modal over the home (e.g. the OKT-Network shutdown notice).
 * Its overlay blocks the settings/network/copy controls, so close it if present. Best-effort no-op when
 * absent. NOTE: this uses OKX's generic dialog close-icon testid (the network selector shares it), so
 * only call it when no legitimate dialog should be open — never after opening the network selector.
 */
async function dismissPromoDialog(tab: Page): Promise<void> {
  const close = tab.locator('[data-testid="okd-dialog-top-close-icon"]').first();
  await close.waitFor({ state: "visible", timeout: SETTLE.MODAL }).catch(() => {});
  if (await close.isVisible().catch(() => false)) {
    await close.click({ force: true, timeout: WAIT_FOR.ACTION_MS }).catch(() => {});
    await sleep(SETTLE.SHORT);
  }
}

/** Switch OKX's UI language to English (Settings → Preferences → Language → English). */
async function switchToEnglish(tab: Page): Promise<void> {
  await clickByTestId(tab, "home-page-top-bar-settings-dropdown");
  await sleep(SETTLE.BRIEF);
  await clickByTestId(tab, "home-page-top-bar-settings-dropdown-item-wallet_extension_top_hover_settings");
  await sleep(SETTLE.BRIEF);
  await clickByTestId(tab, "setting-page-preference-button");
  await sleep(SETTLE.BRIEF);
  await clickByTestId(tab, "preference-page-language-setting-button");

  // The language rows carry no testid — pick English by its stable proper-noun label.
  const english = tab.getByText("English", { exact: true }).first();
  await english.waitFor({ state: "visible", timeout: WAIT_FOR.ELEMENT_SLOW_MS }).catch(() => {});
  await english.click({ force: true, timeout: WAIT_FOR.ACTION_MS }).catch(() => {});

  // OKX downloads the English language pack before applying it — poll until an English label appears.
  for (let i = 0; i < ENGLISH_PACK_POLL_ATTEMPTS; i++) {
    const body = await tab.mainFrame().evaluate(() => document.body?.innerText || "").catch(() => "");
    if (/Language\s*English|\bPreferences\b|\bReceive\b/.test(body)) return;
    await sleep(SETTLE.BRIEF);
  }
}

/** Switch the network to Bitcoin Signet via the globe icon → search "signet" → BTC Signet. */
async function switchToSignet(tab: Page, origin: string): Promise<void> {
  await tab.goto(`${origin}/home.html#/`).catch(() => {});
  await sleep(SETTLE.MEDIUM);
  await dismissPromoDialog(tab); // the reload can re-trigger the promo modal — close it before opening the network selector
  await clickByTestId(tab, "home-page-networks-icon"); // the globe, top-right
  const search = tab.getByPlaceholder(/search network/i).first();
  await search.waitFor({ state: "visible", timeout: WAIT_FOR.ELEMENT_MS }).catch(() => {});
  await search.fill("signet").catch(() => {});
  await sleep(SETTLE.MODAL);
  const signet = tab.getByText("BTC Signet", { exact: true }).first();
  await signet.waitFor({ state: "visible", timeout: WAIT_FOR.ELEMENT_MS }).catch(() => {});
  await signet.click({ force: true, timeout: WAIT_FOR.ACTION_MS }).catch(() => {});
  await sleep(SETTLE.MEDIUM);
}

/**
 * Read the active receive address from the signet home. OKX truncates it on screen (`tb1pky…n0wk`) but the
 * copy button writes the full value to the clipboard; we validate the full read against the truncation so a
 * stale clipboard can't yield a false result, and fall back to the truncated value.
 */
async function readAddress(tab: Page): Promise<string | null> {
  const truncated = await tab
    .mainFrame()
    .evaluate(() => {
      const root = document.querySelector('[data-testid="home-page-home-root-element-id"]');
      return ((root?.textContent || "").match(/tb1p[0-9a-z]+\.\.\.[0-9a-z]+/) ?? [])[0] ?? null;
    })
    .catch(() => null);

  await tab.evaluate("navigator.clipboard.writeText('').catch(() => {})").catch(() => {});
  await clickByTestId(tab, "home-page-copy-address");

  let clip = "";
  for (let i = 0; i < CLIPBOARD_POLL.ATTEMPTS; i++) {
    clip = (((await tab.evaluate("navigator.clipboard.readText().catch(() => '')").catch(() => "")) as string) || "").trim();
    if (FULL_SIGNET_TAPROOT.test(clip)) break;
    await sleep(CLIPBOARD_POLL.INTERVAL_MS);
  }
  if (FULL_SIGNET_TAPROOT.test(clip) && (!truncated || addrMatches(truncated, clip))) return clip;
  return truncated;
}

/**
 * Import `mnemonic` into OKX and return the active Bitcoin Signet taproot (`tb1p…`) address.
 * The extension must already be loaded into `context` (see `launchWalletContext`).
 */
export async function setupOKXWallet(context: BrowserContext, mnemonic: string, password: string): Promise<string> {
  if (!mnemonic) throw new Error("Missing E2E_WALLET_MNEMONIC");
  if (!password) throw new Error("Missing E2E_WALLET_PASSWORD");

  const okxId = runtimeExtensionId(EXTENSION_CHROME_STORE_IDS.OKX);
  const origin = `chrome-extension://${okxId}`;

  // Full-page onboarding tab (not the popup — the popup delegates seed entry to a modal window).
  const tab = await context.newPage();
  await tab.goto(`${origin}/home.html#/initialize`).catch(() => {});
  await tab.waitForLoadState("domcontentloaded").catch(() => {});
  await sleep(SETTLE.MEDIUM);
  await closeForeignTabs(context, tab);

  // Import wallet → seed-phrase entry. Navigate the tab straight to the seed route (clicking the row spawns
  // a modal window); closeForeignTabs then kills that window if it appears.
  await clickByTestId(tab, "onboard-page-import-wallet-button");
  await sleep(SETTLE.MODAL);
  await tab.goto(`${origin}/home.html#/import-with-seed-phrase-and-private-key?openFromThisPage=1`).catch(() => {});
  await tab.waitForLoadState("domcontentloaded").catch(() => {});
  await sleep(SETTLE.MEDIUM);
  await closeForeignTabs(context, tab);

  // Fill the 12 seed words inside the ses.html iframe, then confirm.
  const seedFrame = sesFrame(tab, "import");
  if (!seedFrame) throw new Error("OKX: seed-entry iframe (ses.html) not found");
  const words = mnemonic.trim().split(/\s+/).filter(Boolean);
  const boxes = seedFrame.locator('input[data-testid="import-seed-phrase-or-private-key-page-seed-phrase-input"]');
  await boxes.first().waitFor({ state: "visible", timeout: WAIT_FOR.ELEMENT_SLOW_MS }).catch(() => {});
  for (let i = 0; i < words.length; i++) {
    await boxes.nth(i).click().catch(() => {});
    await boxes.nth(i).fill(words[i]).catch(() => {});
  }
  await sleep(SETTLE.BRIEF);
  const confirmSeed = seedFrame.locator('button[data-testid="import-seed-phrase-or-private-key-page-confirm-button"]');
  await confirmSeed.click({ force: true, timeout: WAIT_FOR.ACTION_MS }).catch(() => {});
  await sleep(SETTLE.LONG);
  await closeForeignTabs(context, tab);

  // Password-type screen: choose Password (not biometric), then Next.
  const typeFrame = sesFrame(tab);
  if (typeFrame) {
    await typeFrame.locator('[data-testid="password-type-item"]').first().click({ force: true }).catch(() => {});
    await sleep(SETTLE.SHORT);
    await clickPrimaryButton(typeFrame);
    await sleep(SETTLE.MODAL);
  }

  // Password entry: fill both fields, confirm.
  const pwFrame = sesFrame(tab);
  if (pwFrame) {
    const pw = pwFrame.locator('input[type="password"]');
    await pw.first().waitFor({ state: "visible", timeout: WAIT_FOR.ELEMENT_MS }).catch(() => {});
    if ((await pw.count().catch(() => 0)) >= 2) {
      await pw.nth(0).fill(password).catch(() => {});
      await pw.nth(1).fill(password).catch(() => {});
      await sleep(SETTLE.SHORT);
      await clickPrimaryButton(pwFrame);
      await sleep(SETTLE.LONG);
    }
  }
  await closeForeignTabs(context, tab);

  // Welcome / supported-chains: content lives outside the ses frame. Uncheck "set OKX as default wallet"
  // (so it won't hijack the provider for other wallets), then click the bottom button — across all frames.
  for (const frame of tab.frames()) {
    const checked = frame.locator('input[type="checkbox"]:checked');
    const n = await checked.count().catch(() => 0);
    for (let i = 0; i < n; i++) await checked.nth(i).uncheck({ force: true }).catch(() => {});
    await clickPrimaryButton(frame);
  }
  await sleep(SETTLE.LONG);
  await closeForeignTabs(context, tab);

  // Wait for the wallet home, then apply English and switch to signet.
  await tab.locator('[data-testid="home-page-home-root-element-id"]').waitFor({ state: "visible", timeout: WAIT_FOR.HOME_MS }).catch(() => {});
  await dismissPromoDialog(tab); // OKX may pop a promo modal on the home that blocks the settings dropdown
  await switchToEnglish(tab);
  await switchToSignet(tab, origin);

  const address = await readAddress(tab);
  await closeForeignTabs(context, tab);
  await tab.close().catch(() => {}); // done — the wallet persists in the profile

  if (!address) throw new Error("OKX: could not read a signet taproot address after import");
  return address;
}
