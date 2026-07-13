/**
 * The shared wallet-connection sequence, reused by every action that needs a connected app
 * (`connect`, `pegin`, `observe`). It drives the vault app's connect flow up to the connected state:
 *
 *   Connect (connect-wallet-button) → Select Bitcoin Wallet (select-bitcoin-wallet-button) →
 *   wallet-option-<id> → approve in the BTC extension popup → Select Ethereum Wallet
 *   (select-ethereum-wallet-button) → MetaMask (Reown AppKit) → approve MetaMask popup →
 *   Connect (chains-connect-button) → the dashboard deposit CTA (data-testid="deposit-button") appears.
 *
 * It assumes a pop-up approver is ALREADY installed on the context (see `approver.ts`) — the approval
 * pop-ups fire asynchronously during these clicks. Callers own the approver lifecycle so they can keep
 * it running afterwards (pegin) or uninstall it (observe, where the human then drives the peg-in).
 * Address verification is NOT done here — that is the `connect` action's own success check.
 */
import type { Page } from "@playwright/test";

import type { BtcWalletId, EthWalletId } from "../config";
import { APPROVAL_WAIT_MS, STEP_TIMEOUT_MS } from "../timing";

import type { ActionContext } from "./types";

/** The Reown AppKit list entry to click per ETH wallet. */
const ETH_APPKIT_NAME: Record<EthWalletId, RegExp> = { metamask: /metamask/i };

/**
 * Drive the connect flow to the connected state (the dashboard deposit button visible). Requires an
 * active pop-up approver on `ctx.context`.
 */
export async function connectWallets(ctx: ActionContext): Promise<void> {
  const { page, log } = ctx;

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
}

/**
 * Open the connected wallet menu. core-ui's `Menu` clones the trigger (the avatar group) and adds
 * `aria-haspopup="true"` + toggles `aria-expanded`, rendering the address cards in a Popover when open.
 * Click the haspopup trigger and confirm the menu opened (retry with the avatar image as a fallback).
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

  // The header has TWO aria-haspopup triggers: the wallet avatar group and the settings gear. Target
  // the avatar group specifically (it contains the wallet avatar images), not the gear.
  const trigger = page
    .locator('[aria-haspopup="true"]')
    .filter({ has: page.locator("img.bbn-avatar-img") })
    .first();
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
