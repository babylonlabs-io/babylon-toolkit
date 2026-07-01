/**
 * UniSat wallet importer for real-extension E2E.
 *
 * Imports a mnemonic and leaves UniSat on **Bitcoin Signet** with the Taproot (P2TR) address active,
 * then returns that receive address for the spec to assert against `deriveSignetTaproot(mnemonic)`.
 *
 * Hard-won gotchas (see also the headed inspector `setup/inspectWallets.ts`):
 *  - UniSat derives taproot with coin type 0' even on signet; force the signet-correct account path
 *    `m/86'/1'/0'/0` (UniSat appends the `/0` index) and explicitly select the Taproot (P2TR) row.
 *  - Seed boxes need real key events — use pressSequentially, not fill().
 *  - Its buttons are <div>/<span> with pointer-events:none text — click by coordinates (tap/advance).
 *  - The "Compatibility Tips" modal must have its checkbox ticked before OK is honored.
 *  - The receive address is truncated in the DOM — read the full value via the clipboard, validated
 *    against the on-screen truncation so a stale clipboard can't yield a false result.
 */
import { type BrowserContext, type Page } from "@playwright/test";

import { EXTENSION_CHROME_STORE_IDS } from "../../setup/downloadExtensions";
import { runtimeExtensionId } from "../../utils/extensionId";
import { addrMatches, advance, clickText, tap, tapTopmost } from "../../utils/walletUi";

/** Signet-correct BIP86 account path; UniSat appends the `/0` receive index → m/86'/1'/0'/0/0. */
const UNISAT_TAPROOT_ACCOUNT_PATH = "m/86'/1'/0'/0";

/** Dismiss UniSat's "Compatibility Tips" modal — its checkbox must be acknowledged before OK works. */
async function dismissModals(page: Page): Promise<void> {
  for (let i = 0; i < 4; i++) {
    if ((await page.getByText(/Compatibility Tips/i).count()) === 0) return;
    const checkbox = page.locator('input[type="checkbox"]').last();
    if ((await checkbox.count()) > 0) await checkbox.check({ force: true }).catch(() => {});
    await page.waitForTimeout(300);
    const okBox = await page.getByText(/^OK$/).last().boundingBox().catch(() => null);
    if (okBox) await page.mouse.click(okBox.x + okBox.width / 2, okBox.y + okBox.height / 2).catch(() => {});
    await page.waitForTimeout(900);
  }
}

/** Switch the network to Bitcoin Signet: pill → expand "Bitcoin Testnet" → "Bitcoin Signet". */
async function switchToSignet(page: Page): Promise<void> {
  await dismissModals(page);
  await tapTopmost(page, /^Bitcoin$/); // network pill at the top of the header
  await page.waitForTimeout(800);
  await tap(page, /^Bitcoin Testnet$/); // expand the testnet group
  await page.waitForTimeout(600);
  await tap(page, /Bitcoin Signet/); // select signet
  await page.waitForTimeout(1500);
}

/** Read the full active taproot address from the Receive screen (via clipboard; DOM is truncated). */
async function readReceiveAddress(page: Page): Promise<string | null> {
  await tap(page, /^Receive$/);
  await page.waitForTimeout(1500);

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
  for (let i = 0; i < 8; i++) {
    clip = (((await page.evaluate("navigator.clipboard.readText().catch(() => '')").catch(() => "")) as string) || "").trim();
    if (/^tb1p[0-9a-z]{50,}$/.test(clip)) break;
    await page.waitForTimeout(300);
  }
  if (/^tb1p[0-9a-z]{50,}$/.test(clip) && (!trunc || addrMatches(trunc, clip))) return clip;
  return trunc; // fall back to the truncated on-screen value (spec compares prefix/suffix)
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
  await page.waitForTimeout(1500);

  // Welcome → "I already have a wallet".
  await clickText(page, /i already have a wallet|already have/i);

  // UniSat asks to create a password first.
  await page.waitForTimeout(800);
  const passwordInputs = page.locator('input[type="password"]');
  if ((await passwordInputs.count()) >= 2) {
    await passwordInputs.nth(0).fill(password);
    await passwordInputs.nth(1).fill(password);
    await clickText(page, /continue|next|submit/i);
  }

  // "Restore from Mnemonics" chooser → source wallet = UniSat Wallet.
  await page.waitForTimeout(1000);
  await clickText(page, /^UniSat Wallet$/);

  // Seed-entry screen — type each word with real key events.
  await page.waitForTimeout(1000);
  const words = mnemonic.trim().split(/\s+/).filter(Boolean);
  const seedInputs = page.locator("input:visible, textarea:visible");
  const seedCount = await seedInputs.count();
  if (seedCount >= words.length) {
    for (let i = 0; i < words.length; i++) {
      await seedInputs.nth(i).click();
      await seedInputs.nth(i).pressSequentially(words[i], { delay: 15 });
    }
  } else {
    await seedInputs.first().click();
    await seedInputs.first().fill(mnemonic.trim());
  }
  await page.waitForTimeout(800);
  await advance(page, /continue|import|next|confirm/i);

  // Address-type screen — force the signet-correct path and select the Taproot (P2TR) row.
  await page.waitForTimeout(1500);
  const customPath = page.getByPlaceholder(/Custom HD Wallet Derivation Path/i);
  if ((await customPath.count()) > 0) {
    await customPath.first().click();
    await customPath.first().fill(UNISAT_TAPROOT_ACCOUNT_PATH);
    await page.waitForTimeout(800);
  }
  await tap(page, /Taproot \(P2TR\)/i);
  await advance(page, /continue|import|confirm|next|ok|done/i);

  // Wallet home (mainnet by default) → switch to signet and read the taproot address.
  await page.waitForTimeout(2500);
  await switchToSignet(page);
  const address = await readReceiveAddress(page);

  await page.close().catch(() => {}); // done — the wallet persists in the profile
  if (!address) throw new Error("UniSat: could not read a signet taproot address after import");
  return address;
}
