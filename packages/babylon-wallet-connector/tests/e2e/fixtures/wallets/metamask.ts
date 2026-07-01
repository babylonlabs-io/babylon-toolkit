/**
 * MetaMask wallet importer for real-extension E2E.
 *
 * Imports a mnemonic through MetaMask's current onboarding, closes the Chrome side panel it opens,
 * and returns the account's Ethereum address for the spec to assert against `deriveEthAddress`.
 *
 * Hard-won gotchas (see also the headed inspector `setup/inspectWallets.ts`):
 *  - Force English via the onboarding language <select> + the context's `env` locale.
 *  - The SRP box splits into a word grid that auto-advances on space; typing the whole phrase drops
 *    the char after each space. Type each word, press Space, then WAIT for the next box to mount.
 *  - Submit buttons stay disabled until valid — wait for enabled (clickWhenEnabled).
 *  - MetaMask's SRP word boxes are input[type=password]; only fill the password once the real
 *    "MetaMask password" screen is showing.
 *  - Onboarding does NOT auto-complete: the wallet stays stuck at /onboarding/completion until
 *    "Open wallet" is clicked (which also opens the side panel).
 *  - The side panel (`sidepanel.html`) is invisible to context.pages() and in-page window.close() is
 *    blocked by LavaMoat — close it at the browser level via CDP Target.closeTarget.
 *  - A fresh home.html tab opens locked/at a residual onboarding step — settle it (unlock/passkey).
 */
import { type BrowserContext, type Page } from "@playwright/test";

import { EXTENSION_CHROME_STORE_IDS } from "../../setup/downloadExtensions";
import { runtimeExtensionId } from "../../utils/extensionId";
import { SETTLE, TYPE_DELAY_MS } from "../../utils/timing";
import { clickText, clickWhenEnabled, scanEthAddress } from "../../utils/walletUi";

/** MetaMask-specific timeouts/loop bounds (values preserved from the verified onboarding flow). */
const WALLET_SETTLE_STEPS = 15; // settleWallet loop: drive residual onboarding until the home renders
const POST_PASSWORD_STEPS = 8; // dismiss-screen attempts after setting the password
const UNLOCK_ENABLE_MS = 4000; // wait for the unlock submit button to enable
const DISMISS_CLICK_MS = 2000; // click timeout for optional dismiss buttons
const OPEN_WALLET_CLICK_MS = 5000; // click timeout for the "Open wallet" button
const SIDE_PANEL_APPEAR_MS = 8000; // wait for the side panel to open after "Open wallet"
const SIDE_PANEL_RECHECK_MS = 3000; // shorter re-check in case a panel re-opened

/** Close MetaMask's docked side panel via CDP (browser-level; LavaMoat can't block it). Optionally
 * poll for it to appear first — its presence also signals onboarding has finalized. */
async function closeSidePanel(page: Page, waitMs = 0): Promise<number> {
  const cdp = await page.context().newCDPSession(page);
  const findPanels = async () => {
    const { targetInfos } = (await cdp.send("Target.getTargets")) as {
      targetInfos: Array<{ targetId: string; type: string; url: string }>;
    };
    return targetInfos.filter((t) => t.type === "page" && /\/sidepanel\.html(?:[#?].*)?$/.test(t.url));
  };
  const deadline = Date.now() + waitMs;
  let panels = await findPanels();
  while (panels.length === 0 && Date.now() < deadline) {
    await page.waitForTimeout(SETTLE.SHORT);
    panels = await findPanels();
  }
  for (const panel of panels) await cdp.send("Target.closeTarget", { targetId: panel.targetId }).catch(() => {});
  return panels.length;
}

/** Enter the password if the page is showing a lock screen (fresh tab opens at #/onboarding/unlock). */
async function unlockIfNeeded(page: Page, password: string): Promise<boolean> {
  const pw = page.locator('input[type="password"]').first();
  if ((await pw.count()) === 0) return false;
  await pw.fill(password);
  await pw.press("Enter").catch(() => {});
  await clickWhenEnabled(page, /Unlock|Confirm|Log in|Submit/i, UNLOCK_ENABLE_MS);
  await page.waitForTimeout(SETTLE.MEDIUM);
  return true;
}

/** Drive a fresh MetaMask tab to the actual wallet home, absorbing residual onboarding (unlock /
 * decline passkey). Deterministic: loops until the wallet home renders rather than waiting a guess. */
async function settleWallet(page: Page, base: string, password: string): Promise<boolean> {
  for (let i = 0; i < WALLET_SETTLE_STEPS; i++) {
    const url = page.url();
    const onWallet = !/\/onboarding\//.test(url) && (await page.getByRole("button", { name: /^Receive$/i }).count()) > 0;
    if (onWallet) return true;

    if (/unlock/i.test(url) || (await page.locator('input[type="password"]').count()) > 0) {
      await unlockIfNeeded(page, password);
    } else if (/passkey|biometric/i.test(url) || (await page.getByText(/passkey|biometric/i).count()) > 0) {
      for (const label of ["Maybe later", "Not now", "Skip", "No thanks"]) {
        const loc = page.getByText(label, { exact: true }).first();
        if ((await loc.count()) > 0) {
          await loc.click({ timeout: DISMISS_CLICK_MS }).catch(() => {});
          break;
        }
      }
    } else {
      await page.goto(`${base}/home.html#/`).catch(() => {}); // nudge back toward the wallet home
    }
    await page.waitForTimeout(SETTLE.MODAL);
  }
  return false;
}

/** Read the account address. The home shows a truncated pill (0xAAA…ZZZ), which is enough for the
 * prefix/suffix assertion; prefer a full 40-char address if one happens to be present. */
async function readAddress(page: Page): Promise<string | null> {
  const full = await scanEthAddress(page);
  if (full) return full;
  const body = await page.locator("body").innerText().catch(() => "");
  const truncated = body.match(/0x[0-9a-fA-F]{3,}(?:\.{2,}|…)[0-9a-fA-F]{3,}/);
  return truncated ? truncated[0] : null;
}

/**
 * Import `mnemonic` into MetaMask, close its side panel, and return the account's Ethereum address.
 * The extension must already be loaded into `context` (see `launchWalletContext`).
 */
export async function setupMetaMaskWallet(context: BrowserContext, mnemonic: string, password: string): Promise<string> {
  if (!mnemonic) throw new Error("Missing E2E_WALLET_MNEMONIC");
  if (!password) throw new Error("Missing E2E_WALLET_PASSWORD");

  const extensionId = runtimeExtensionId(EXTENSION_CHROME_STORE_IDS.METAMASK);
  const onboardingTab = await context.newPage();
  await onboardingTab.goto(`chrome-extension://${extensionId}/home.html#onboarding/welcome`).catch(() => {});
  await onboardingTab.waitForLoadState("domcontentloaded").catch(() => {});
  await onboardingTab.waitForTimeout(SETTLE.MEDIUM);
  const tid = (id: string) => onboardingTab.getByTestId(id);

  // Force English, then choose the import-existing-wallet → Secret Recovery Phrase path.
  const languageSelect = onboardingTab.locator("select").first();
  if ((await languageSelect.count()) > 0) {
    await languageSelect.selectOption("en").catch(() => {});
    await onboardingTab.waitForTimeout(SETTLE.BRIEF);
  }
  await clickText(onboardingTab, /I have an existing wallet|Import an existing wallet/i);
  await onboardingTab.waitForTimeout(SETTLE.MODAL);
  await clickText(onboardingTab, /Import using Secret Recovery Phrase|Secret Recovery Phrase|Import a wallet with|Continue with a Secret/i);
  await onboardingTab.waitForTimeout(SETTLE.MODAL);
  await clickText(onboardingTab, /^I agree$|No thanks|Got it/i); // optional analytics prompt
  await onboardingTab.waitForTimeout(SETTLE.MODAL);

  // Secret Recovery Phrase — per-word testids if present, else the word-grid (type word + Space + wait).
  const words = mnemonic.trim().split(/\s+/).filter(Boolean);
  if ((await tid("import-srp__srp-word-0").count()) > 0) {
    for (let i = 0; i < words.length; i++) {
      await tid(`import-srp__srp-word-${i}`).click().catch(() => {});
      await tid(`import-srp__srp-word-${i}`).pressSequentially(words[i], { delay: TYPE_DELAY_MS }).catch(() => {});
    }
  } else {
    const box = (await onboardingTab.getByRole("textbox").count()) > 0
      ? onboardingTab.getByRole("textbox").first()
      : onboardingTab.locator("input:visible, textarea:visible").first();
    await box.click();
    await onboardingTab.keyboard.press("ControlOrMeta+A");
    await onboardingTab.keyboard.press("Backspace");
    for (let i = 0; i < words.length; i++) {
      await onboardingTab.keyboard.type(words[i], { delay: TYPE_DELAY_MS });
      if (i < words.length - 1) {
        await onboardingTab.keyboard.press("Space");
        await onboardingTab.waitForTimeout(SETTLE.KEYSTROKE); // let the grid mount + focus the next word box
      }
    }
  }
  await onboardingTab.waitForTimeout(SETTLE.BRIEF);
  await clickWhenEnabled(onboardingTab, /Continue|Import wallet|Confirm/i);
  await onboardingTab.waitForTimeout(SETTLE.MEDIUM);

  // Guard: MetaMask's SRP word boxes are also input[type=password]; only fill the password once the
  // real password screen is showing, else we'd dump the password into the seed boxes.
  if ((await onboardingTab.getByText(/Create new password|MetaMask password/i).count()) === 0) {
    throw new Error("MetaMask: SRP was not accepted (never reached the password screen)");
  }

  // Create password (both fields + acknowledge checkbox), wait for the submit to enable.
  const passwordInputs = onboardingTab.locator('input[type="password"]');
  if ((await passwordInputs.count()) >= 2) {
    await passwordInputs.nth(0).fill(password);
    await passwordInputs.nth(1).fill(password);
  }
  await onboardingTab.locator('input[type="checkbox"]').first().check({ force: true }).catch(() => {});
  await clickWhenEnabled(onboardingTab, /Create password|Import my wallet|Confirm/i);
  await onboardingTab.waitForTimeout(SETTLE.LONG);

  // Post-password screens (decline biometrics etc.) until the "Your wallet is ready!" completion.
  const dismissLabels = ["Maybe later", "Remind me later", "Not now", "Skip", "No thanks", "Got it", "Done", "Next", "Continue"];
  for (let i = 0; i < POST_PASSWORD_STEPS; i++) {
    if (await scanEthAddress(onboardingTab)) break;
    if ((await onboardingTab.getByText(/Your wallet is ready|Open wallet/i).count()) > 0) break;
    let clicked = false;
    for (const label of dismissLabels) {
      const loc = onboardingTab.getByText(label, { exact: true }).first();
      if ((await loc.count()) > 0) {
        await loc.click({ timeout: DISMISS_CLICK_MS }).catch(() => {});
        await onboardingTab.waitForTimeout(SETTLE.BRIEF);
        clicked = true;
        break;
      }
    }
    if (!clicked) await onboardingTab.waitForTimeout(SETTLE.BRIEF);
  }

  // Finalize onboarding by clicking "Open wallet" (also opens the side panel), then close the panel.
  await onboardingTab.getByRole("button", { name: /Open wallet/i }).first().click({ timeout: OPEN_WALLET_CLICK_MS }).catch(() => {});
  await onboardingTab.waitForTimeout(SETTLE.MODAL);
  await closeSidePanel(onboardingTab, SIDE_PANEL_APPEAR_MS);

  // Read the wallet in a fresh tab, driving through any residual onboarding (unlock / passkey).
  const base = (onboardingTab.url().match(/^(chrome-extension:\/\/[a-p]{32})\//) ?? [])[1] ?? `chrome-extension://${extensionId}`;
  const walletPage = await context.newPage();
  await walletPage.goto(`${base}/home.html#/`).catch(() => {});
  await settleWallet(walletPage, base, password);

  await onboardingTab.close().catch(() => {}); // completion tab no longer needed
  await closeSidePanel(walletPage, SIDE_PANEL_RECHECK_MS); // in case a panel re-opened

  const address = await readAddress(walletPage);
  await walletPage.close().catch(() => {}); // done — the wallet persists in the profile
  if (!address) throw new Error("MetaMask: could not read an address after import");
  return address;
}
