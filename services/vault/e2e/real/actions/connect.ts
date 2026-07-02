/**
 * The "connect" action: drive the vault app's real wallet-connection flow and verify it.
 *
 * Flow (selectors confirmed against services/vault + core-ui source and website devnet):
 *   Connect (connect-wallet-button) → Select Bitcoin Wallet (select-bitcoin-wallet-button) →
 *   wallet-option-<id> → approve in the BTC extension popup → Select Ethereum Wallet
 *   (select-ethereum-wallet-button) → MetaMask (Reown AppKit) → approve MetaMask popup →
 *   Connect (chains-connect-button) → the deposit CTA (data-testid="deposit-button") appears.
 * Success = open the wallet menu (the avatar group) and confirm the BTC + ETH addresses each card
 * displays (a truncated "first6...last6", read straight from the DOM) match the derived addresses.
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
  APPROVE_CLICK_TIMEOUT_MS,
  APPROVE_ROUNDS,
  APPROVE_ROUND_MS,
  HEADER_SETTLE_MS,
  MENU_OPEN_TIMEOUT_MS,
  STEP_TIMEOUT_MS,
} from "../timing";
import { centerWindow } from "../windowUtils";

import { type Action, type ActionContext, waitSeam } from "./types";

/**
 * Try every known "approve/connect" control shape inside an extension popup. Returns the accessible
 * name/text of the control it clicked (so the caller can log WHAT it approved — an unexpected extra
 * prompt should be visible in the log, not silently confirmed), or null if nothing matched.
 */
async function clickApprove(popup: Page): Promise<string | null> {
  const rx = /^(connect|approve|next|confirm|sign|got it)$/i;
  const label = async (loc: ReturnType<Page["locator"]>, fallback: string) =>
    (await loc.textContent().catch(() => ""))?.trim() || fallback;

  const byRole = popup.getByRole("button", { name: rx }).first();
  if (await byRole.isVisible().catch(() => false)) {
    const name = await label(byRole, "(button)");
    // Bounded timeout: if the button is still disabled (e.g. an unticked consent checkbox), fail fast
    // and let the next round retry after tickConsent runs, rather than blocking on the 30s default.
    await byRole.click({ timeout: APPROVE_CLICK_TIMEOUT_MS }).catch(() => {});
    return name;
  }
  const primary = popup
    .locator('[preset="primary"], button[data-testid="okd-button"]')
    .last();
  if (await primary.isVisible().catch(() => false)) {
    const name = await label(primary, "(primary)");
    await primary.click({ force: true }).catch(() => {});
    return name;
  }
  const byText = popup.getByText(rx, { exact: true }).last();
  if (await byText.isVisible().catch(() => false)) {
    const name = await label(byText, "(text)");
    await byText.click({ force: true }).catch(() => {});
    return name;
  }
  return null;
}

/**
 * Tick the consent control that gates the approve button, if one is present. OneKey on an insecure
 * `http://localhost` origin shows "Proceed at my own risk" and keeps Approve `aria-disabled` until it's
 * ticked. That control is a custom element (a `div` with a stable testid, NOT a real checkbox — hence
 * no `role="checkbox"`). We click it only while Approve is still disabled: clicking toggles it, so the
 * `aria-disabled` gate keeps this idempotent across rounds, and it is a no-op on secure origins / other
 * wallets that have no such gate.
 */
async function tickConsent(popup: Page): Promise<void> {
  const approve = popup.getByRole("button", { name: /^approve$/i }).first();
  if (!(await approve.isVisible().catch(() => false))) return;
  const gated =
    (await approve.getAttribute("aria-disabled").catch(() => null)) === "true";
  if (!gated) return;
  const consent = popup
    .locator('[data-testid="dapp-connection-continue-operate-checkbox"]')
    .first();
  if (await consent.isVisible().catch(() => false))
    await consent
      .click({ force: true, timeout: APPROVE_CLICK_TIMEOUT_MS })
      .catch(() => {});
}

/** Center + auto-approve any extension approval popup that opens during connect. */
function installPopupApprover(
  context: BrowserContext,
  log: (m: string) => void,
): (p: Page) => void {
  const handler = (popup: Page) => {
    // Detached listener: guard EVERYTHING — a popup that closes mid-approve must never reject and crash
    // the process (the whole point of approving is that the popup then vanishes).
    void (async () => {
      try {
        // Wait for load FIRST, then filter: extension approval windows are opened by the service
        // worker and their URL is `about:blank` until the navigation commits — checking the URL at
        // 'page'-event time would skip the popup permanently.
        await popup.waitForLoadState("domcontentloaded").catch(() => {});
        if (!popup.url().startsWith("chrome-extension://")) return;
        await centerWindow(popup);
        const file = popup.url().split("/").pop();
        for (let round = 0; round < APPROVE_ROUNDS; round++) {
          if (popup.isClosed()) break;
          await popup.waitForTimeout(APPROVE_ROUND_MS).catch(() => {});
          if (popup.isClosed()) break;
          await tickConsent(popup).catch(() => {});
          const clicked = await clickApprove(popup).catch(() => null);
          if (!clicked) break;
          log(`Approved "${clicked}" in wallet popup ${file}`);
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

/**
 * Verify one chain's address in the open wallet menu. The card renders the address via core-ui's
 * `DisplayHash` as a truncated `first6...last6` string, which `addrMatches` compares against the full
 * expected address by prefix + suffix. We read it straight from the DOM (no clipboard) — clipboard
 * reads throw "Document is not focused" whenever a popup holds focus, and clicking copy would swap the
 * address node for a "Copied ✓" label. The label ("{walletLabel} Wallet") is stripped before matching.
 */
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
  // Nearest ancestor block that also holds the copy button — contains the label + the address only.
  const card = label.locator("xpath=ancestor::div[.//button][1]");
  const cardText = (await card.innerText().catch(() => ""))
    .replace(/\s+/g, " ")
    .trim();
  const displayed = cardText.replace(`${walletLabel} Wallet`, "").trim();
  const ok = addrMatches(displayed, expected);
  log(
    `${walletLabel} address: displayed="${displayed}" expected=${expected} → ${ok ? "MATCH" : "MISMATCH"}`,
  );
  if (!ok)
    throw new Error(
      `${walletLabel} address does not match expected ${expected} (shown "${displayed}")`,
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

      log("Waiting for connected state (deposit button)");
      await page
        .locator('[data-testid="deposit-button"]')
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
