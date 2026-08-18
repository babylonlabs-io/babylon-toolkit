/**
 * UniSat wallet importer for real-extension E2E.
 *
 * Imports a mnemonic and leaves UniSat on **Bitcoin Signet** with the Taproot (P2TR) address active,
 * then returns that receive address for the spec to assert against `deriveSignetTaproot(mnemonic)`.
 *
 * Hard-won gotchas (see also the headed inspector `setup/inspectWallets.ts`):
 *  - UniSat derives taproot with coin type 0' even on signet; force the signet-correct account path
 *    `m/86'/1'/0'/0` (UniSat appends the `/0` index) and explicitly select the Taproot (P2TR) row.
 *    That path field is behind an opt-in checkbox, and skipping it fails SILENTLY — the import still
 *    yields a well-formed `tb1p…` address, just at the wrong path — so the card label is asserted.
 *  - The import screen has no 12/24 selector: it auto-detects the word count. Before any word is
 *    committed it is a single textarea that commits on Space/Enter (splitting on whitespace), and
 *    once words exist that textarea unmounts in favour of a chip grid — so the whole phrase goes in
 *    as one fill+Enter, never word by word.
 *  - Its buttons are <div>/<span> with pointer-events:none text — click by coordinates (tap/advance).
 *  - The "Compatibility Tips" modal must have its checkbox ticked before OK is honored.
 *  - The receive address is truncated in the DOM — read the full value via the clipboard, validated
 *    against the on-screen truncation so a stale clipboard can't yield a false result.
 */
import { type BrowserContext, type Page } from "@playwright/test";

import { EXTENSION_CHROME_STORE_IDS } from "../../setup/downloadExtensions";
import { runtimeExtensionId } from "../../utils/extensionId";
import { CLIPBOARD_POLL, SETTLE, WAIT_FOR } from "../../utils/timing";
import { addrMatches, advance, clickText, tap, tapTopmost } from "../../utils/walletUi";

/** Signet-correct BIP86 account path; UniSat appends the `/0` receive index → m/86'/1'/0'/0/0. */
const UNISAT_TAPROOT_ACCOUNT_PATH = "m/86'/1'/0'/0";

/** The Taproot row on the address-type screen — also that screen's marker (see `advanceFromImport`). */
const TAPROOT_ROW = /Taproot \(P2TR\)/i;

/** The receive path the Taproot card must show once the signet account path has been applied. */
const UNISAT_TAPROOT_RECEIVE_PATH = `${UNISAT_TAPROOT_ACCOUNT_PATH}/0`;

/** Testids on UniSat's address-type screen. */
const ADDRESS_TYPE_TESTID = {
  /** Opt-in for the custom derivation path; the input below is only mounted once it is ticked. */
  CUSTOM_PATH_TOGGLE: "custom-hdpath-enabled-checkbox-input",
  CUSTOM_PATH_INPUT: "custom-hdpath-input",
  /** Prefix of the per-address-type cards; each label carries the path it would derive at. */
  CARD_PREFIX: "address-type-card-",
} as const;

/** How many times to re-try dismissing the "Compatibility Tips" modal before giving up. */
const MODAL_DISMISS_ATTEMPTS = 4;

/** Dismiss UniSat's "Compatibility Tips" modal — its checkbox must be acknowledged before OK works. */
async function dismissModals(page: Page): Promise<void> {
  for (let i = 0; i < MODAL_DISMISS_ATTEMPTS; i++) {
    if ((await page.getByText(/Compatibility Tips/i).count()) === 0) return;
    const checkbox = page.locator('input[type="checkbox"]').last();
    if ((await checkbox.count()) > 0) await checkbox.check({ force: true }).catch(() => {});
    await page.waitForTimeout(SETTLE.KEYSTROKE);
    const okBox = await page.getByText(/^OK$/).last().boundingBox().catch(() => null);
    if (okBox) await page.mouse.click(okBox.x + okBox.width / 2, okBox.y + okBox.height / 2).catch(() => {});
    await page.waitForTimeout(SETTLE.BRIEF);
  }
}

/** Testids on UniSat's mnemonic-import screen. */
const IMPORT_TESTID = {
  /** The single textarea rendered while no word has been committed yet. */
  INITIAL_INPUT: "mnemonic-import-initial-input",
  /** Prefix of the per-word chips rendered once words have been committed. */
  WORD_PREFIX: "mnemonic-import-word-",
  CONTINUE: "mnemonic-import-continue-button",
} as const;

/** How many times to click the import screen's Continue before giving up. */
const IMPORT_CONTINUE_ATTEMPTS = 4;

/**
 * Enter the whole recovery phrase on UniSat's import screen.
 *
 * There is no word-count selector to drive: the screen auto-detects 12 vs 24. Until a word is
 * committed it renders a single textarea whose Space/Enter handler commits its buffer, splitting on
 * whitespace — and that first commit unmounts the textarea in favour of a grid of per-word chips.
 * So the phrase goes in as ONE fill + Enter (typing it word by word would lose the textarea after
 * the first space), and the chip count is what proves every word actually landed.
 */
async function enterMnemonic(page: Page, words: string[]): Promise<void> {
  const initial = page.locator(`[data-testid="${IMPORT_TESTID.INITIAL_INPUT}"]`);
  await initial.waitFor({ state: "visible", timeout: WAIT_FOR.ELEMENT_MS }).catch(() => {});
  if ((await initial.count()) === 0)
    throw new Error(
      `UniSat: the seed textarea ([data-testid="${IMPORT_TESTID.INITIAL_INPUT}"]) never appeared. Its ` +
        "restore UI likely changed; re-derive enterMnemonic (unisat.ts) against the installed extension.",
    );

  await initial.fill(words.join(" "));
  await initial.press("Enter");
  await page.waitForTimeout(SETTLE.BRIEF);

  const committed = await page.locator(`[data-testid^="${IMPORT_TESTID.WORD_PREFIX}"]`).count();
  if (committed !== words.length)
    throw new Error(
      `UniSat: the import screen committed ${committed} seed words but the phrase has ${words.length} — ` +
        "the whole phrase was not accepted.",
    );
}

/**
 * Leave the import screen for the address-type screen. Continue stays disabled until UniSat has
 * validated the phrase, and it is a pointer-events:none div — so click by coordinates and confirm we
 * actually advanced (the Taproot row is the address-type screen's marker) instead of assuming a click
 * on a still-disabled button did anything.
 */
async function advanceFromImport(page: Page): Promise<void> {
  const addressTypeScreen = page.getByText(TAPROOT_ROW);
  for (let i = 0; i < IMPORT_CONTINUE_ATTEMPTS; i++) {
    if ((await addressTypeScreen.count()) > 0) return;
    await clickTestId(page, IMPORT_TESTID.CONTINUE);
    await page.waitForTimeout(SETTLE.MEDIUM);
  }
  if ((await addressTypeScreen.count()) === 0)
    throw new Error(
      `UniSat: Continue ([data-testid="${IMPORT_TESTID.CONTINUE}"]) did not advance past the import ` +
        "screen — the phrase was rejected, or the address-type screen changed.",
    );
}

/**
 * Address-type screen: force the signet-correct derivation path, then select the Taproot (P2TR) card.
 *
 * UniSat derives taproot with coin type 0' even on signet, so the custom path has to be set — and it
 * sits behind an opt-in checkbox whose input is only mounted once ticked. Getting this wrong is
 * silent: the import still succeeds and still yields a well-formed `tb1p…` address, just at the wrong
 * path. So both controls are required, and the chosen card's own label — which renders the path it
 * would derive at — is asserted before the row is picked.
 */
async function selectSignetTaproot(page: Page): Promise<void> {
  const toggle = page.locator(`[data-testid="${ADDRESS_TYPE_TESTID.CUSTOM_PATH_TOGGLE}"]`);
  if ((await toggle.count()) === 0)
    throw new Error(
      `UniSat: the custom-derivation-path opt-in ([data-testid="${ADDRESS_TYPE_TESTID.CUSTOM_PATH_TOGGLE}"]) ` +
        "is missing from the address-type screen; without it the wallet derives taproot at coin type 0'.",
    );
  await toggle.first().check({ force: true });
  await page.waitForTimeout(SETTLE.SHORT);

  const customPath = page.locator(`[data-testid="${ADDRESS_TYPE_TESTID.CUSTOM_PATH_INPUT}"]`);
  await customPath.first().waitFor({ state: "visible", timeout: WAIT_FOR.ELEMENT_MS }).catch(() => {});
  if ((await customPath.count()) === 0)
    throw new Error(
      `UniSat: the derivation-path field ([data-testid="${ADDRESS_TYPE_TESTID.CUSTOM_PATH_INPUT}"]) did not ` +
        "appear after enabling the custom path.",
    );
  await customPath.first().fill(UNISAT_TAPROOT_ACCOUNT_PATH);
  // The cards re-derive their addresses off the new path before their labels update.
  await page.waitForTimeout(SETTLE.MEDIUM);

  const cards = page.locator(`[data-testid^="${ADDRESS_TYPE_TESTID.CARD_PREFIX}"]`);
  const cardCount = await cards.count();
  for (let i = 0; i < cardCount; i++) {
    const label = await cards.nth(i).innerText().catch(() => "");
    if (!TAPROOT_ROW.test(label)) continue;
    if (!label.includes(UNISAT_TAPROOT_RECEIVE_PATH))
      throw new Error(
        `UniSat: the Taproot card derives at a path other than ${UNISAT_TAPROOT_RECEIVE_PATH} — the custom ` +
          `derivation path did not take. Card label: ${label.replace(/\s+/g, " ").trim()}`,
      );
    await clickTestId(page, `${ADDRESS_TYPE_TESTID.CARD_PREFIX}${i}`);
    await page.waitForTimeout(SETTLE.SHORT);
    return;
  }
  throw new Error(
    `UniSat: no Taproot (P2TR) card on the address-type screen (${cardCount} cards found).`,
  );
}

/** Switch the network to Bitcoin Signet: pill → expand "Bitcoin Testnet" → "Bitcoin Signet". */
async function switchToSignet(page: Page): Promise<void> {
  await dismissModals(page);
  await tapTopmost(page, /^Bitcoin$/); // network pill at the top of the header
  await page.waitForTimeout(SETTLE.BRIEF);
  await tap(page, /^Bitcoin Testnet$/); // expand the testnet group
  await page.waitForTimeout(SETTLE.SHORT);
  await tap(page, /Bitcoin Signet/); // select signet
  await page.waitForTimeout(SETTLE.MODAL);
}

/** Read the full active taproot address from the Receive screen (via clipboard; DOM is truncated). */
async function readReceiveAddress(page: Page): Promise<string | null> {
  await tap(page, /^Receive$/);
  await page.waitForTimeout(SETTLE.MODAL);

  const bodyText = (await page.evaluate("document.body.innerText").catch(() => "")) as string;
  const trunc = (bodyText.match(/tb1p[0-9a-z]+\.\.\.[0-9a-z]+/) ?? [])[0] ?? null;
  const fullOnPage = bodyText.match(/tb1p[0-9a-z]{50,}/);
  if (fullOnPage) return fullOnPage[0]; // some screens render the full address directly

  // Clear the clipboard first so a stale value from a previous run can't produce a false result.
  await page.evaluate("navigator.clipboard.writeText('').catch(() => {})").catch(() => {});
  const truncated = page.getByText(/tb1p[0-9a-z]+\.\.\.[0-9a-z]+/).last();
  const box = await truncated.boundingBox().catch(() => null);
  if (box) await page.mouse.click(box.x + box.width + 14, box.y + box.height / 2).catch(() => {}); // copy icon

  let clip = "";
  for (let i = 0; i < CLIPBOARD_POLL.ATTEMPTS; i++) {
    clip = (((await page.evaluate("navigator.clipboard.readText().catch(() => '')").catch(() => "")) as string) || "").trim();
    if (/^tb1p[0-9a-z]{50,}$/.test(clip)) break;
    await page.waitForTimeout(CLIPBOARD_POLL.INTERVAL_MS);
  }
  if (/^tb1p[0-9a-z]{50,}$/.test(clip) && (!trunc || addrMatches(trunc, clip))) return clip;
  return trunc; // fall back to the truncated on-screen value (spec compares prefix/suffix)
}

/** UniSat's longest "Automatic Lock Time" option (its dropdown tops out here). */
const UNISAT_MAX_AUTO_LOCK = "4Hours";

/** Coordinate-click a UniSat control by testid (its buttons are pointer-events:none div/span). */
async function clickTestId(page: Page, testid: string): Promise<boolean> {
  const box = await page
    .locator(`[data-testid="${testid}"]`)
    .first()
    .boundingBox()
    .catch(() => null);
  if (!box) return false;
  await page.mouse
    .click(box.x + box.width / 2, box.y + box.height / 2)
    .catch(() => {});
  return true;
}

/**
 * Raise UniSat's auto-lock timeout to its maximum (4 Hours). The default is **3 minutes**, which
 * re-locks the wallet mid-run — a real peg-in takes ~30 min–2 hr and would otherwise stall at
 * "Bitcoin wallet locked". Path: bottom tab Settings → Advanced (settings_advanced) → "Automatic Lock
 * Time" → "4Hours". Fails loudly: a silent no-op reintroduces the exact lock stall this prevents, so
 * the per-wallet spec (test:e2e:unisat) surfaces any UniSat settings-UI drift immediately.
 */
async function extendAutoLock(page: Page): Promise<void> {
  // Land on the wallet home deterministically (readReceiveAddress leaves us on the Receive screen).
  await page.goto(page.url().replace(/#.*$/, "") + "#/main").catch(() => {});
  await page.waitForTimeout(SETTLE.MODAL);

  if (!(await clickTestId(page, "tab-settings")))
    throw new Error("UniSat auto-lock: Settings tab (tab-settings) not found");
  await page.waitForTimeout(SETTLE.SHORT);
  if (!(await clickTestId(page, "settings_advanced")))
    throw new Error(
      "UniSat auto-lock: Advanced settings (settings_advanced) not found",
    );
  await page.waitForTimeout(SETTLE.SHORT);
  await tap(page, /Automatic Lock Time/i); // open the options list
  await page.waitForTimeout(SETTLE.SHORT);
  await tap(page, new RegExp(`^${UNISAT_MAX_AUTO_LOCK}$`)); // pick the max option
  await page.waitForTimeout(SETTLE.MODAL);

  // Verify it took: the options list closed (no "30Seconds" option visible) AND the row shows 4Hours.
  // Checking the list closed avoids a false pass from the still-open list (which also contains "4Hours").
  const body = (await page
    .evaluate("document.body.innerText")
    .catch(() => "")) as string;
  const listClosed = !/30\s*Seconds/i.test(body);
  const showsMax = new RegExp(UNISAT_MAX_AUTO_LOCK).test(body);
  if (!listClosed || !showsMax)
    throw new Error(
      `UniSat auto-lock: expected "${UNISAT_MAX_AUTO_LOCK}" to be selected, but the setting did not update`,
    );
}

/**
 * Import `mnemonic` into UniSat and return the active Bitcoin Signet taproot (`tb1p…`) address.
 * The extension must already be loaded into `context` (see `launchWalletContext`).
 */
export async function setupUnisatWallet(context: BrowserContext, mnemonic: string, password: string): Promise<string> {
  if (!mnemonic) throw new Error("Missing E2E_WALLET_MNEMONIC");
  if (!password) throw new Error("Missing E2E_WALLET_PASSWORD");

  const extensionId = runtimeExtensionId(EXTENSION_CHROME_STORE_IDS.UNISAT);
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/index.html`).catch(() => {});
  await page.waitForLoadState("domcontentloaded").catch(() => {});
  await page.waitForTimeout(SETTLE.MODAL);

  // Welcome → "I already have a wallet".
  await clickText(page, /i already have a wallet|already have/i);

  // UniSat asks to create a password first.
  await page.waitForTimeout(SETTLE.BRIEF);
  const passwordInputs = page.locator('input[type="password"]');
  if ((await passwordInputs.count()) >= 2) {
    await passwordInputs.nth(0).fill(password);
    await passwordInputs.nth(1).fill(password);
    await clickText(page, /continue|next|submit/i);
  }

  // "Restore from Mnemonics" chooser → source wallet = UniSat Wallet.
  await page.waitForTimeout(SETTLE.BRIEF);
  await clickText(page, /^UniSat Wallet$/);

  // Seed-entry screen — the phrase goes in as one commit; UniSat auto-detects 12 vs 24 words.
  await page.waitForTimeout(SETTLE.BRIEF);
  const words = mnemonic.trim().split(/\s+/).filter(Boolean);
  await enterMnemonic(page, words);
  await advanceFromImport(page);

  // Address-type screen — force the signet-correct path and select the Taproot (P2TR) row.
  await selectSignetTaproot(page);
  await advance(page, /continue|import|confirm|next|ok|done/i);

  // Wallet home (mainnet by default) → switch to signet and read the taproot address.
  await page.waitForTimeout(SETTLE.MEDIUM);
  await switchToSignet(page);
  const address = await readReceiveAddress(page);

  // Keep the wallet unlocked for the length of a real peg-in run (default auto-lock is 3 minutes).
  await extendAutoLock(page);

  await page.close().catch(() => {}); // done — the wallet persists in the profile
  if (!address) throw new Error("UniSat: could not read a signet taproot address after import");
  return address;
}
