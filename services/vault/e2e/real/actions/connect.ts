/**
 * The "connect" action: drive the vault app's real wallet-connection flow and verify it.
 *
 * Flow (selectors confirmed against services/vault + core-ui source and website devnet):
 *   Connect (connect-wallet-button) → Select Bitcoin Wallet (select-bitcoin-wallet-button) →
 *   wallet-option-<id> → approve in the BTC extension popup → Select Ethereum Wallet
 *   (select-ethereum-wallet-button) → MetaMask (Reown AppKit) → approve MetaMask popup →
 *   Connect (chains-connect-button) → "Deposit sBTC" appears.
 * Success = open the wallet menu (the avatar group) and confirm the displayed BTC + ETH addresses
 * (read via each card's copy button → clipboard) match the derived/imported addresses.
 *
 * Approval popups are extension windows — separate pages in the same context (MetaMask/UniSat/OKX use
 * `notification.html`; OneKey uses a `ConnectionModal` window). A context-level handler centers each
 * popup (for visibility) and clicks its primary approve control, which differs per wallet: MetaMask
 * and OKX use a real <button> (matched by the connect/approve/confirm role name); UniSat uses a styled
 * <div preset="primary">; OneKey uses a real <button>. A `button[data-testid="okd-button"]` fallback
 * covers OKX's OKD-styled buttons. Any `chrome-extension://` page is handled, so filenames don't matter.
 */
import type { BrowserContext, Page } from "@playwright/test";

import type { BtcWalletId } from "../config";
import { addrMatches } from "../connector";
import {
  APPROVAL_WAIT_MS,
  APPROVE_ROUNDS,
  APPROVE_ROUND_MS,
  CLIPBOARD_POLL,
  HEADER_SETTLE_MS,
  MENU_OPEN_TIMEOUT_MS,
  STEP_TIMEOUT_MS,
} from "../timing";
import { centerWindow } from "../windowUtils";

import { type Action, type ActionContext, waitSeam } from "./types";

/** Try every known "approve/connect" control shape inside an extension popup. Returns true if clicked. */
async function clickApprove(popup: Page): Promise<boolean> {
  const rx = /^(connect|approve|next|confirm|sign|got it)$/i;
  const byRole = popup.getByRole("button", { name: rx }).first();
  if (await byRole.isVisible().catch(() => false)) {
    await byRole.click().catch(() => {});
    return true;
  }
  const primary = popup
    .locator('[preset="primary"], button[data-testid="okd-button"]')
    .last();
  if (await primary.isVisible().catch(() => false)) {
    await primary.click({ force: true }).catch(() => {});
    return true;
  }
  const byText = popup.getByText(rx, { exact: true }).last();
  if (await byText.isVisible().catch(() => false)) {
    await byText.click({ force: true }).catch(() => {});
    return true;
  }
  return false;
}

/** Center + auto-approve any extension approval popup that opens during connect. */
function installPopupApprover(
  context: BrowserContext,
  log: (m: string) => void,
): (p: Page) => void {
  const handler = (popup: Page) => {
    if (!popup.url().startsWith("chrome-extension://")) return;
    // Detached listener: guard EVERYTHING — a popup that closes mid-approve must never reject and crash
    // the process (the whole point of approving is that the popup then vanishes).
    void (async () => {
      try {
        await popup.waitForLoadState("domcontentloaded").catch(() => {});
        await centerWindow(popup);
        log(`Approving wallet popup: ${popup.url().split("/").pop()}`);
        for (let round = 0; round < APPROVE_ROUNDS; round++) {
          if (popup.isClosed()) break;
          await popup.waitForTimeout(APPROVE_ROUND_MS).catch(() => {});
          if (popup.isClosed()) break;
          if (!(await clickApprove(popup).catch(() => false))) break;
        }
      } catch {
        // popup vanished (approved) or navigated — nothing to do.
      }
    })();
  };
  context.on("page", handler);
  return handler;
}

/**
 * Open the connected wallet menu. core-ui's `Menu` clones the trigger (the avatar group) and adds
 * `aria-haspopup="true"` + toggles `aria-expanded`, rendering the address cards in a Popover when open.
 * Click the haspopup trigger and confirm the menu opened (retry with the avatar image as a fallback).
 */
async function openWalletMenu(
  page: Page,
  log: (m: string) => void,
): Promise<void> {
  const isOpen = () =>
    page
      .getByText("Bitcoin Wallet", { exact: true })
      .first()
      .waitFor({ state: "visible", timeout: MENU_OPEN_TIMEOUT_MS })
      .then(() => true)
      .catch(() => false);

  // The header has TWO aria-haspopup triggers: the wallet avatar group and the settings gear. Target
  // the avatar group specifically (it contains the wallet avatar images), not the gear.
  const trigger = page
    .locator('[aria-haspopup="true"]')
    .filter({ has: page.locator("img.bbn-avatar-img") })
    .first();
  await trigger
    .waitFor({ state: "visible", timeout: STEP_TIMEOUT_MS })
    .catch(() => {});
  await page.waitForTimeout(HEADER_SETTLE_MS); // let the header settle so the first click registers
  await trigger.click({ force: true }).catch(() => {});
  if (await isOpen()) return;

  log("wallet menu not open — retrying the avatar trigger");
  await page.keyboard.press("Escape").catch(() => {});
  await trigger.click({ force: true }).catch(() => {});
  if (await isOpen()) return;

  throw new Error("Could not open the connected wallet menu");
}

/** Open the connected wallet menu (the avatar-group trigger) and read + verify one chain's address. */
async function verifyMenuAddress(
  page: Page,
  walletLabel: string,
  expected: string,
  log: (m: string) => void,
): Promise<void> {
  const label = page
    .getByText(`${walletLabel} Wallet`, { exact: true })
    .first();
  await label.waitFor({ state: "visible", timeout: STEP_TIMEOUT_MS });
  // Nearest ancestor card that contains a button (the copy button).
  const card = label.locator("xpath=ancestor::div[.//button][1]");
  await page
    .evaluate("navigator.clipboard.writeText('').catch(() => {})")
    .catch(() => {});
  await card
    .locator("button")
    .last()
    .click({ force: true })
    .catch(() => {});
  let clip = "";
  for (let i = 0; i < CLIPBOARD_POLL.ATTEMPTS; i++) {
    clip = (
      ((await page
        .evaluate("navigator.clipboard.readText().catch(() => '')")
        .catch(() => "")) as string) || ""
    ).trim();
    if (clip) break;
    await page.waitForTimeout(CLIPBOARD_POLL.INTERVAL_MS);
  }
  const displayed = (await card.innerText().catch(() => ""))
    .replace(/\s+/g, " ")
    .trim();
  const ok =
    (clip && addrMatches(clip, expected)) || addrMatches(displayed, expected);
  log(
    `${walletLabel} address: clipboard=${clip || "(none)"} displayed="${displayed}" expected=${expected} → ${ok ? "MATCH" : "MISMATCH"}`,
  );
  if (!ok)
    throw new Error(
      `${walletLabel} address does not match expected ${expected} (clipboard "${clip}", shown "${displayed}")`,
    );
}

const ETH_APPKIT_NAME: Record<string, RegExp> = { metamask: /metamask/i };

export const connectAction: Action = {
  id: "connect",
  async run(ctx: ActionContext): Promise<void> {
    const { page, context, log } = ctx;
    const handler = installPopupApprover(context, log);
    try {
      log("Clicking Connect");
      await page
        .locator('[data-testid="connect-wallet-button"]')
        .first()
        .click({ timeout: STEP_TIMEOUT_MS });

      log(`Selecting BTC wallet: ${ctx.btc.id}`);
      await page
        .locator('[data-testid="select-bitcoin-wallet-button"]')
        .click({ timeout: STEP_TIMEOUT_MS });
      await page
        .locator(`[data-testid="wallet-option-${ctx.btc.id as BtcWalletId}"]`)
        .click({ timeout: STEP_TIMEOUT_MS });
      // Wait for the BTC approval popup to be handled and the app to register the address.
      await page.waitForTimeout(APPROVAL_WAIT_MS);

      log(`Selecting ETH wallet: ${ctx.eth.id}`);
      await page
        .locator('[data-testid="select-ethereum-wallet-button"]')
        .click({ timeout: STEP_TIMEOUT_MS });
      await page
        .getByText(ETH_APPKIT_NAME[ctx.eth.id] ?? /metamask/i, { exact: false })
        .first()
        .click({ timeout: STEP_TIMEOUT_MS });
      await page.waitForTimeout(APPROVAL_WAIT_MS);

      log("Finalizing (Connect)");
      await page
        .locator('[data-testid="chains-connect-button"]')
        .click({ timeout: STEP_TIMEOUT_MS })
        .catch(() => {});

      log("Waiting for connected state (Deposit sBTC)");
      await page
        .getByRole("button", { name: /^Deposit s?BTC$/i })
        .first()
        .waitFor({ state: "visible", timeout: STEP_TIMEOUT_MS });

      log("Opening wallet menu to verify addresses");
      await openWalletMenu(page, log);
      await verifyMenuAddress(page, "Bitcoin", ctx.btc.address, log);
      await verifyMenuAddress(page, "Ethereum", ctx.eth.address, log);

      await waitSeam(ctx, "post-connect");
      log("Connect verified ✅ (both addresses match)");
    } finally {
      context.off("page", handler);
    }
  },
};
