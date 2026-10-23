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
 *    blocked by LavaMoat — close it at the browser level via CDP Target.closeTarget. Since 13.44
 *    MetaMask opens there BY DEFAULT, which hides every approval from the approver, so the import
 *    switches it back to pop-up mode (see `usePopupApprovals`).
 *  - A fresh home.html tab opens locked/at a residual onboarding step — settle it (unlock/passkey).
 */
import { type BrowserContext, type Locator, type Page } from "@playwright/test";

import { EXTENSION_CHROME_STORE_IDS } from "../../setup/downloadExtensions";
import { deriveEthAddress } from "../../setup/eth";
import { runtimeExtensionId } from "../../utils/extensionId";
import { SETTLE, TYPE_DELAY_MS, WAIT_FOR } from "../../utils/timing";
import { addrMatches, clickText, clickWhenEnabled, scanEthAddress } from "../../utils/walletUi";

/** MetaMask-specific timeouts/loop bounds (values preserved from the verified onboarding flow). */
const WALLET_SETTLE_STEPS = 15; // settleWallet loop: drive residual onboarding until the home renders
const POST_PASSWORD_STEPS = 8; // dismiss-screen attempts after setting the password
const UNLOCK_ENABLE_MS = 4000; // wait for the unlock submit button to enable
const DISMISS_CLICK_MS = 2000; // click timeout for optional dismiss buttons
const OPEN_WALLET_CLICK_MS = 5000; // click timeout for the "Open wallet" button
const SIDE_PANEL_APPEAR_MS = 8000; // wait for the side panel to open after "Open wallet"
const SIDE_PANEL_RECHECK_MS = 3000; // shorter re-check in case a panel re-opened
const ADD_ACCOUNT_MS = 20000; // account-tree sync to finish, or one "Add account" to land

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

/**
 * Backup and sync, as onboarding offers it. When the completion screen's "Open wallet" finishes
 * onboarding, MetaMask restores the accounts of the SRP's synced profile — with the profile's own
 * names, and with the accounts the profile hides left off the list — unless Backup and sync is off by
 * then; with it off, later account adds are not pushed to that profile either. Onboarding keeps the
 * choice in page state only and applies it on that click, so it has to be made on the completion
 * screen and the click has to follow in the same document: a reload resets it to on, and so does a
 * completion MetaMask performs itself after an unlock.
 */
const MM_ONBOARDING_COMPLETE_TESTID = "parent-selector-onboarding-complete";
const MM_MANAGE_DEFAULT_SETTINGS_TESTID = "manage-default-settings";
const MM_PRIVACY_SETTINGS_TESTID = "parent-selector-onboarding-privacy-settings";
const MM_GENERAL_SETTINGS_TESTID = "category-item-General";
const MM_CATEGORY_BACK_TESTID = "category-back-button";
const MM_PRIVACY_SETTINGS_BACK_TESTID = "privacy-settings-back-button";
const MM_ONBOARDING_DONE_TESTID = "onboarding-complete-done";
/** The toggle's real checkbox is visually hidden; the container takes the click, as MetaMask's own
 * page objects do. Its label carries the state as a class. */
const MM_BACKUP_AND_SYNC_TOGGLE_TESTID = "backup-and-sync-toggle-container";
const MM_TOGGLE_ON_SELECTOR = ".toggle-button--on";
const MM_TOGGLE_OFF_SELECTOR = ".toggle-button--off";
const MM_BACKUP_AND_SYNC_SETTINGS_ROUTE = "#/settings/backup-and-sync";

/** On the onboarding completion screen, switch Backup and sync off and come back to it. */
async function turnOffBackupAndSync(page: Page): Promise<void> {
  const step = async (testid: string, what: string) =>
    page
      .getByTestId(testid)
      .waitFor({ state: "visible", timeout: WAIT_FOR.ELEMENT_SLOW_MS })
      .catch(() => {
        throw new Error(`MetaMask: ${what} (${testid}) never appeared while turning Backup and sync off.`);
      });

  await step(MM_ONBOARDING_COMPLETE_TESTID, "the onboarding completion screen");
  await page.getByTestId(MM_MANAGE_DEFAULT_SETTINGS_TESTID).click({ timeout: WAIT_FOR.ACTION_MS });
  await step(MM_PRIVACY_SETTINGS_TESTID, "the default settings screen");
  await page.getByTestId(MM_GENERAL_SETTINGS_TESTID).click({ timeout: WAIT_FOR.ACTION_MS });

  const toggle = page.getByTestId(MM_BACKUP_AND_SYNC_TOGGLE_TESTID);
  await step(MM_BACKUP_AND_SYNC_TOGGLE_TESTID, "the Backup and sync toggle");
  if ((await toggle.locator(MM_TOGGLE_ON_SELECTOR).count()) > 0) await toggle.click({ timeout: WAIT_FOR.ACTION_MS });
  await toggle
    .locator(MM_TOGGLE_OFF_SELECTOR)
    .waitFor({ state: "visible", timeout: WAIT_FOR.ELEMENT_MS })
    .catch(() => {
      throw new Error("MetaMask: Backup and sync did not switch off on the default settings screen.");
    });

  await page.getByTestId(MM_CATEGORY_BACK_TESTID).click({ timeout: WAIT_FOR.ACTION_MS });
  await page.getByTestId(MM_PRIVACY_SETTINGS_BACK_TESTID).click({ timeout: WAIT_FOR.ACTION_MS });
  await step(MM_ONBOARDING_COMPLETE_TESTID, "the onboarding completion screen, on the way back");
}

/** Refuse to touch the account list unless Backup and sync really ended up off. */
async function assertBackupAndSyncOff(page: Page, base: string): Promise<void> {
  await page.goto(`${base}/home.html${MM_BACKUP_AND_SYNC_SETTINGS_ROUTE}`).catch(() => {});
  const toggle = page.getByTestId(MM_BACKUP_AND_SYNC_TOGGLE_TESTID);
  await toggle.waitFor({ state: "visible", timeout: WAIT_FOR.ELEMENT_SLOW_MS }).catch(() => {
    throw new Error(`MetaMask: the Backup and sync setting (${MM_BACKUP_AND_SYNC_SETTINGS_ROUTE}) never rendered.`);
  });
  if ((await toggle.locator(MM_TOGGLE_OFF_SELECTOR).count()) === 0)
    throw new Error(
      "MetaMask: Backup and sync is on after onboarding, so the account list is the synced profile's and an added account would be pushed to it.",
    );
}

/**
 * MetaMask's account list (13.50+): one cell per account of the imported SRP. A cell's testid ends
 * in its address index (`multichain-account-cell-entropy:<srp id>/<index>`), and it shows the
 * account's truncated address. With Backup and sync off the indexes run from 0 without a gap: on
 * import MetaMask only discovers accounts in order, up to the first one with no Ethereum mainnet
 * transactions. Names are still no guide to the index, so cells are matched by address.
 *
 * The list is virtualized: only the rows in or just past the viewport are in the DOM, and "Add
 * account" is its last row. So this reaches the first several accounts of a fresh import, not an
 * arbitrary N — past the rendered window neither the target nor the add control can be found.
 */
const MM_ACCOUNT_LIST_ROUTE = "#/account-list";
const MM_ACCOUNT_LIST_PAGE_TESTID = "parent-selector-account-list-page";
const MM_ACCOUNT_CELL_TESTID_PREFIX = "multichain-account-cell-";
const MM_ACCOUNT_CELL_ADDRESS_TESTID = "multichain-account-cell-hovered-addresses";
const MM_ACCOUNT_CELL_INDEX_RX = /\/(\d+)$/;
/** A Box, not a <button>. It is a silent no-op while the account tree syncs or an add is in flight,
 * and its label then reads "Adding account..." — so wait for the idle label before every click. It
 * always adds the index after the highest one listed. Discovery can still be adding accounts in the
 * background, where an add may return one discovery made instead of a new one — so every add is
 * judged by re-reading the list, never by its own outcome. */
const MM_ADD_ACCOUNT_TESTID = "add-multichain-account-button";
const MM_ADD_ACCOUNT_IDLE_LABEL = "Add account";

interface ListedAccount {
  index: number;
  address: string;
  cell: Locator;
}

/** Poll until `check` holds, up to `timeoutMs`. */
async function waitUntil(page: Page, check: () => Promise<boolean>, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await check()) return true;
    await page.waitForTimeout(SETTLE.SHORT);
  }
  return check();
}

/** The accounts the list shows, with each one's address index and truncated address. */
async function readAccountList(page: Page): Promise<ListedAccount[]> {
  const cells = page
    .locator(`[data-testid^="${MM_ACCOUNT_CELL_TESTID_PREFIX}"]`)
    .filter({ has: page.getByTestId(MM_ACCOUNT_CELL_ADDRESS_TESTID) });
  const accounts: ListedAccount[] = [];
  for (let i = 0; i < (await cells.count()); i++) {
    const cell = cells.nth(i);
    const index = ((await cell.getAttribute("data-testid")) ?? "").match(MM_ACCOUNT_CELL_INDEX_RX);
    const address = (await cell.getByTestId(MM_ACCOUNT_CELL_ADDRESS_TESTID).innerText().catch(() => "")).trim();
    if (index && address) accounts.push({ index: Number(index[1]), address, cell });
  }
  return accounts;
}

/**
 * Make the account at `addressIndex` the selected one, found by its derived address, adding accounts
 * until it is listed. Selecting it before the dApp connects is what the dApp gets: MetaMask's connect
 * page pre-ticks the selected account. Only call this with Backup and sync off (see
 * assertBackupAndSyncOff): with it on, the list can have gaps an add never fills, and every add is
 * pushed to the SRP's synced profile.
 */
async function selectAccount(page: Page, base: string, addressIndex: number, expected: string): Promise<void> {
  await page.goto(`${base}/home.html${MM_ACCOUNT_LIST_ROUTE}`).catch(() => {});
  await page
    .getByTestId(MM_ACCOUNT_LIST_PAGE_TESTID)
    .waitFor({ state: "visible", timeout: WAIT_FOR.ELEMENT_SLOW_MS })
    .catch(() => {
      throw new Error(`MetaMask: the account list (${MM_ACCOUNT_LIST_ROUTE}) never rendered.`);
    });

  const addButton = page.getByTestId(MM_ADD_ACCOUNT_TESTID);
  const addIdle = async () =>
    ((await addButton.innerText().catch(() => "")) ?? "").trim() === MM_ADD_ACCOUNT_IDLE_LABEL;
  // One add per missing index, each allowed its own wait, plus one for the list to settle.
  const deadline = Date.now() + ADD_ACCOUNT_MS * (addressIndex + 2);

  for (;;) {
    if (!(await waitUntil(page, addIdle, ADD_ACCOUNT_MS)))
      throw new Error(
        `MetaMask: "${MM_ADD_ACCOUNT_IDLE_LABEL}" never read idle: it is busy, or not rendered (the account list is virtualized, so a long list pushes it out of the DOM).`,
      );
    const listed = await readAccountList(page);
    if (listed.length === 0)
      throw new Error(
        `MetaMask: the account list shows no readable account cell (${MM_ACCOUNT_CELL_TESTID_PREFIX}… with ${MM_ACCOUNT_CELL_ADDRESS_TESTID}).`,
      );
    const target = listed.find((account) => addrMatches(account.address, expected));
    if (target) {
      await target.cell.click({ timeout: WAIT_FOR.ACTION_MS });
      await page.waitForTimeout(SETTLE.MODAL);
      return;
    }
    const highest = Math.max(...listed.map((account) => account.index));
    if (addressIndex <= highest)
      throw new Error(
        `MetaMask: account index ${addressIndex} (${expected}) is missing although index ${highest} is listed.`,
      );
    if (Date.now() > deadline)
      throw new Error(`MetaMask: account index ${addressIndex} is still not listed (highest is ${highest}).`);
    await addButton.click({ timeout: WAIT_FOR.ACTION_MS });
    await waitUntil(page, async () => (await readAccountList(page)).length > listed.length, ADD_ACCOUNT_MS);
  }
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

/** Account-menu item that toggles between popup and side-panel view; its label names the TARGET view. */
const MM_VIEW_TOGGLE_TESTID = "global-menu-toggle-view";

/**
 * Side-panel route with the account-menu drawer already open. Since 13.50 the account menu (behind the
 * hamburger button) is a drawer that this query opens, which spares a click on a button the
 * unread-notifications badge overlaps.
 */
const MM_MENU_DRAWER_ROUTE = "#/?drawerOpen=true";

/** The auto-lock value MetaMask ships with (its Security settings show it as a word, not minutes). */
const MM_EXPECTED_AUTO_LOCK = "Never";

/** MetaMask's Security-and-password settings route, navigated to directly (see `verifyAutoLockNever`). */
const MM_SECURITY_SETTINGS_ROUTE = "#/settings/security-and-password";

/**
 * Verify MetaMask's auto-lock is "Never" so the wallet doesn't re-lock during a run (steps 4 and 14 of
 * a peg-in are MetaMask transactions; a locked wallet stalls them).
 *
 * Goes straight to the Security settings ROUTE rather than driving account options → Settings →
 * "Security and password". MetaMask renders an unread-notifications badge that intermittently
 * overlays the account-options button and swallows the click (Playwright reports
 * `notifications-tag-counter__unread-dot … intercepts pointer events`), and LavaMoat's scuttling
 * blocks the usual `dispatchEvent` escape hatch — so the menu path is a race we cannot win. The route
 * reaches the same screen with nothing to intercept.
 *
 * Fails loudly if it isn't "Never" (or the row can't be found) — that's the signal to capture
 * MetaMask's auto-lock SETTER and switch this from a verify to a set. The per-wallet spec
 * (test:e2e:metamask) exercises this.
 */
async function verifyAutoLockNever(page: Page): Promise<void> {
  const base = (page.url().match(/^(chrome-extension:\/\/[a-p]{32})\//) ?? [])[1];
  if (!base)
    throw new Error(
      `MetaMask auto-lock: expected a chrome-extension wallet page, got "${page.url()}"`,
    );
  await page.goto(`${base}/home.html${MM_SECURITY_SETTINGS_ROUTE}`).catch(() => {});
  await page.waitForTimeout(SETTLE.MODAL);

  const label = page.getByText("Auto lock", { exact: true }).first();
  await label.waitFor({ state: "visible", timeout: WAIT_FOR.ELEMENT_MS }).catch(() => {});
  if ((await label.count()) === 0)
    throw new Error(
      `MetaMask auto-lock: "Auto lock" row not found at ${MM_SECURITY_SETTINGS_ROUTE} — the settings route or layout changed`,
    );
  // The row div holds the label <p> and the current-value <p> side by side; read the whole row.
  const rowText = (await label.locator("xpath=..").innerText().catch(() => ""))
    .replace(/\s+/g, " ")
    .trim();
  if (!new RegExp(MM_EXPECTED_AUTO_LOCK, "i").test(rowText))
    throw new Error(
      `MetaMask auto-lock: expected "${MM_EXPECTED_AUTO_LOCK}" but the Auto lock row reads "${rowText}"`,
    );
}

/**
 * Put MetaMask back into POPUP mode, so approvals open as `notification.html` windows.
 *
 * As of 13.44 MetaMask "opens in the side panel by default" (its own migration toast). Chrome does not
 * expose a side panel as a Playwright page — no `page` event fires and it never appears in
 * `context.pages()` — so an approval raised there is invisible to the pop-up approver and a run simply
 * stalls with the request unconfirmed. Flipping the preference restores the pre-13.44 behaviour, which
 * every approval path in this harness is already built around.
 *
 * The toggle only renders in the popup/side-panel view (never in the expanded tab), so this drives it
 * from `sidepanel.html` opened AS A TAB — the same trick that makes the panel reachable at all. Since
 * 13.50 the toggle ("Switch to popup") sits in the account-menu drawer. The drawer's route opens it
 * directly: the off-centre click on the hamburger that used to open the menu stopped opening it, and
 * the toggle, present in the DOM but hidden, was then clicked in vain. The toggle's visibility and the
 * panel's close are both waited for rather than assumed after a fixed settle.
 *
 * Confirmed by the panel document closing itself, which is what switching view modes does. Note the
 * toggle's LABEL cannot be used: it names the current view, and read from `sidepanel.html` that is
 * always "Switch to popup" whatever the stored preference is. Failing silently here would reintroduce
 * an invisible-approval stall that only surfaces much later as an unexplained timeout, so it throws.
 */
async function usePopupApprovals(
  context: BrowserContext,
  base: string,
): Promise<void> {
  const panel = await context.newPage();
  try {
    await panel.goto(`${base}/sidepanel.html${MM_MENU_DRAWER_ROUTE}`).catch(() => {});

    const toggle = panel
      .locator(`[data-testid="${MM_VIEW_TOGGLE_TESTID}"]`)
      .first();
    await toggle.waitFor({ state: "visible", timeout: WAIT_FOR.ELEMENT_SLOW_MS }).catch(() => {});
    if (!(await toggle.isVisible().catch(() => false)))
      throw new Error(
        `MetaMask: view toggle (${MM_VIEW_TOGGLE_TESTID}) never became visible in the account-menu drawer (sidepanel.html${MM_MENU_DRAWER_ROUTE}) — cannot put approvals into pop-ups, which the approver requires.`,
      );
    await toggle.click({ timeout: WAIT_FOR.ELEMENT_MS }).catch(() => {});

    const closeDeadline = Date.now() + WAIT_FOR.ELEMENT_SLOW_MS;
    while (!panel.isClosed() && Date.now() < closeDeadline)
      await panel.waitForTimeout(SETTLE.SHORT).catch(() => {});

    if (!panel.isClosed())
      throw new Error(
        "MetaMask: failed to switch to pop-up mode — the side-panel document is still open. Approvals would open in the side panel, where the approver cannot reach them.",
      );
  } finally {
    await panel.close().catch(() => {});
  }
}

/**
 * Import `mnemonic` into MetaMask, select "Account `accountNumber`", close its side panel, and return
 * that account's Ethereum address. The extension must already be loaded into `context` (see
 * `launchWalletContext`).
 */
export async function setupMetaMaskWallet(
  context: BrowserContext,
  mnemonic: string,
  password: string,
  accountNumber = 1,
): Promise<string> {
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
  // Any account but the first needs Backup and sync off first, and then this click must land: a
  // completion that happens any other way applies the default, sync on (see turnOffBackupAndSync).
  if (accountNumber !== 1) {
    await turnOffBackupAndSync(onboardingTab);
    await onboardingTab.getByTestId(MM_ONBOARDING_DONE_TESTID).click({ timeout: OPEN_WALLET_CLICK_MS });
  } else {
    await onboardingTab.getByRole("button", { name: /Open wallet/i }).first().click({ timeout: OPEN_WALLET_CLICK_MS }).catch(() => {});
  }
  await onboardingTab.waitForTimeout(SETTLE.MODAL);
  await closeSidePanel(onboardingTab, SIDE_PANEL_APPEAR_MS);

  // Read the wallet in a fresh tab, driving through any residual onboarding (unlock / passkey).
  const base = (onboardingTab.url().match(/^(chrome-extension:\/\/[a-p]{32})\//) ?? [])[1] ?? `chrome-extension://${extensionId}`;
  const walletPage = await context.newPage();
  await walletPage.goto(`${base}/home.html#/`).catch(() => {});
  await settleWallet(walletPage, base, password);

  await onboardingTab.close().catch(() => {}); // completion tab no longer needed
  await closeSidePanel(walletPage, SIDE_PANEL_RECHECK_MS); // in case a panel re-opened

  if (accountNumber !== 1) {
    await assertBackupAndSyncOff(walletPage, base);
    await selectAccount(walletPage, base, accountNumber - 1, deriveEthAddress(mnemonic, accountNumber));
    await walletPage.goto(`${base}/home.html#/`).catch(() => {});
    await settleWallet(walletPage, base, password);
  }

  const address = await readAddress(walletPage);

  // Confirm auto-lock won't re-lock the wallet mid-run (expected to already be "Never").
  await verifyAutoLockNever(walletPage);

  // Approvals must open as pop-up windows; the side panel is invisible to Playwright.
  await usePopupApprovals(context, base);

  await walletPage.close().catch(() => {}); // done — the wallet persists in the profile
  if (!address) throw new Error("MetaMask: could not read an address after import");
  return address;
}
