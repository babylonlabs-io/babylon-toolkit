/**
 * The shared wallet-connection sequence, reused by every action that needs a connected app
 * (`connect`, `pegin`, `observe`). It drives the vault app's connect flow up to the connected state:
 *
 *   Connect (connect-wallet-button) → Select Bitcoin Wallet (select-bitcoin-wallet-button) →
 *   wallet-option-<id> → approve in the BTC extension popup → Select Ethereum Wallet
 *   (select-ethereum-wallet-button) → MetaMask (Reown AppKit) → approve MetaMask popup →
 *   Connect (chains-connect-button) → the header wallet menu (data-testid="wallet-menu-trigger")
 *   appears.
 *
 * The connected-state signal is the header's wallet-menu trigger, NOT a page CTA: v3 splits the old
 * dashboard across routes, so the deposit CTA now lives on /vaults only (markdown/e2e-v3/01-connect.md).
 * The menu trigger renders on every route the moment both wallets are connected.
 *
 * It assumes a pop-up approver is ALREADY installed on the context (see `approver.ts`) — the approval
 * pop-ups fire asynchronously during these clicks. Callers own the approver lifecycle so they can keep
 * it running afterwards (pegin) or uninstall it (observe, where the human then drives the peg-in).
 * Address verification is NOT done here — that is the `connect` action's own success check.
 */
import type { BrowserContext, Page } from "@playwright/test";

import type { BtcWalletId, EthWalletId } from "../config";
import {
  APPROVAL_WAIT_MS,
  CONNECT_STATE_POLL_MS,
  CONNECT_STATE_TIMEOUT_MS,
  MS_PER_SECOND,
  STEP_TIMEOUT_MS,
} from "../timing";

import { sweepApprovals } from "./approver";
import type { ActionContext } from "./types";

/** The Reown AppKit list entry to click per ETH wallet. */
const ETH_APPKIT_NAME: Record<EthWalletId, RegExp> = { metamask: /metamask/i };

/** Sweep approvals repeatedly for `durationMs` — a wait that also clears anything sitting pending. */
async function sweepUntil(
  context: BrowserContext,
  page: Page,
  log: (m: string) => void,
  durationMs: number,
): Promise<void> {
  const deadline = Date.now() + durationMs;
  while (Date.now() < deadline) {
    await sweepApprovals(context, page, log);
    await page.waitForTimeout(CONNECT_STATE_POLL_MS);
  }
}

/**
 * The header's connected wallet menu (the avatar-group trigger, src/components/Wallet/Connect.tsx). It
 * renders ONLY once both wallets are connected and on EVERY route, which makes it both the connected-
 * state signal and the menu trigger.
 */
export const WALLET_MENU_TRIGGER_TESTID = '[data-testid="wallet-menu-trigger"]';

/**
 * Drive the connect flow to the connected state (the header wallet menu visible). Requires an active
 * pop-up approver on `ctx.context`.
 */
export async function connectWallets(ctx: ActionContext): Promise<void> {
  const { page, context, log } = ctx;

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
  // Sweep DURING this wait rather than sleeping through it. MetaMask's connect approval is not
  // reliably picked up by the event approver — in practice it is this sweep that clears it (its log
  // lines come from `sweepApprovals`, not the 'page' handler), most likely because the window is
  // reused rather than opened fresh. Sleeping here left the approval pending long enough for the
  // dApp's own connect modal to fall back to "Try again", and that modal then stayed up as a
  // portal-root overlay covering the nav — so the run died on the NEXT click, far from the cause.
  await sweepUntil(context, page, log, APPROVAL_WAIT_MS);

  log("Finalizing (Connect)");

  // Poll for the connected state while actively sweeping approval popups. MetaMask can insert an EXTRA
  // approval AFTER the initial connect — a "Review permissions / Use your enabled networks" prompt whose
  // Confirm (page-container-footer-next) must be clicked before the app flips to connected. That prompt
  // can land after the popup approver's per-window rounds have ended (or in a reused window that fires no
  // 'page' event), so a one-shot waitFor would just time out with it hanging. Sweeping each tick clicks
  // it (clickApprove already matches that Confirm), the same way the borrow/repay confirm loops do.
  //
  // The modal's own Connect is retried each tick rather than clicked once up front: it stays disabled
  // until BOTH wallets have reported in, so a single early click is silently dropped and the modal then
  // sits open forever. The header can already show the connected wallet menu at that point, so the menu
  // alone is not proof of success — this only returns once the modal is actually GONE. Leaving it open
  // is what covered the app in a portal-root overlay and broke the first click after connect.
  const finalize = page.locator('[data-testid="chains-connect-button"]');
  const walletMenu = page.locator(WALLET_MENU_TRIGGER_TESTID).first();
  const deadline = Date.now() + CONNECT_STATE_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const modalOpen = await finalize.isVisible().catch(() => false);
    if (!modalOpen && (await walletMenu.isVisible().catch(() => false))) return;
    // Short timeout on purpose: the button is visible-but-disabled until both wallets report in, and
    // a full STEP_TIMEOUT_MS wait here would block the tick and starve the approval sweep below.
    if (modalOpen)
      await finalize.click({ timeout: CONNECT_STATE_POLL_MS }).catch(() => {});
    await sweepApprovals(context, page, log);
    await page.waitForTimeout(CONNECT_STATE_POLL_MS);
  }
  throw new Error(
    `connect: the Connect Wallets modal did not close into the connected state (header wallet menu) within ${Math.round(CONNECT_STATE_TIMEOUT_MS / MS_PER_SECOND)}s — a wallet approval (e.g. MetaMask "Review permissions") may be unconfirmed.`,
  );
}

/**
 * Open the connected wallet menu. core-ui's `Menu` clones the trigger (the avatar group) and adds
 * `aria-haspopup="true"` + toggles `aria-expanded`, rendering the address cards in a Popover when open.
 * Click the trigger and confirm the menu opened (one retry, since the header can swallow the first
 * click while it settles).
 */
export async function openWalletMenu(
  page: Page,
  log: (m: string) => void,
  menuOpenTimeoutMs: number,
  headerSettleMs: number,
): Promise<void> {
  const isOpen = () =>
    page
      .getByText("Bitcoin Wallet", { exact: true })
      .first()
      .waitFor({ state: "visible", timeout: menuOpenTimeoutMs })
      .then(() => true)
      .catch(() => false);

  // The header has TWO aria-haspopup triggers: the wallet avatar group and the settings gear — hence
  // the testid on the avatar group rather than a structural match on either.
  const trigger = page.locator(WALLET_MENU_TRIGGER_TESTID).first();
  await trigger
    .waitFor({ state: "visible", timeout: STEP_TIMEOUT_MS })
    .catch(() => {});
  await page.waitForTimeout(headerSettleMs); // let the header settle so the first click registers
  await trigger.click({ force: true }).catch(() => {});
  if (await isOpen()) return;

  log("wallet menu not open — retrying the avatar trigger");
  await page.keyboard.press("Escape").catch(() => {});
  await trigger.click({ force: true }).catch(() => {});
  if (await isOpen()) return;

  throw new Error("Could not open the connected wallet menu");
}
