/**
 * The shared wallet-connection sequence, reused by every action that needs a connected app
 * (`connect`, `pegin`, `observe`, …). It drives the vault app's connect flow up to the connected state:
 *
 *   Connect (connect-wallet-button) → Select Bitcoin Wallet (select-bitcoin-wallet-button) →
 *   wallet-option-<id> → approve in the BTC extension popup → Select Ethereum Wallet
 *   (select-ethereum-wallet-button) → MetaMask (Reown AppKit) → approve MetaMask popup →
 *   Connect (chains-connect-button) → the navbar shows the fully-connected wallet menu.
 *
 * Bitcoin is OPTIONAL for the app session (the vault declares `requiredChains={["ETH"]}`), so
 * `connectWallets` takes a `btc` option: with it (the default) the run ends in the both-wallets state,
 * without it in the Ethereum-only state. Either way the finish line is read off the navbar's wallet
 * controls, never off a page CTA — a page CTA renders with Ethereum alone, so waiting on one would
 * report success for a Bitcoin connect that silently failed and blow up much later.
 *
 * It assumes a pop-up approver is ALREADY installed on the context (see `approver.ts`) — the approval
 * pop-ups fire asynchronously during these clicks. Callers own the approver lifecycle so they can keep
 * it running afterwards (pegin) or uninstall it (observe, where the human then drives the peg-in).
 * Address verification is NOT done here — that is the `connect` action's own success check.
 */
import type { Locator, Page } from "@playwright/test";

import type { EthWalletId } from "../config";
import { addrMatches } from "../connector";
import {
  APPROVAL_WAIT_MS,
  CONNECT_STATE_POLL_MS,
  CONNECT_STATE_TIMEOUT_MS,
  MS_PER_SECOND,
  STEP_TIMEOUT_MS,
} from "../timing";

import { sweepApprovals } from "./approver";
import {
  btcWalletOption,
  CHAINS_CONNECT_TESTID,
  CONNECT_WALLET_TESTID,
  connectBtcButton,
  ETHEREUM_WALLET_CARD,
  SELECT_BITCOIN_WALLET_TESTID,
  SELECT_ETHEREUM_WALLET_TESTID,
  unlockBtcButton,
  walletMenuTrigger,
} from "./selectors";
import type { ActionContext } from "./types";

/** The Reown AppKit list entry to click per ETH wallet. */
const ETH_APPKIT_NAME: Record<EthWalletId, RegExp> = { metamask: /metamask/i };

/**
 * The session state the navbar is advertising, in the order it is probed. The order matters: the
 * BTC-specific controls are checked FIRST because on a build that predates their testids they fall
 * back to the shared `connect-wallet-button`, and each control only exists in its own state — so a
 * `connect-wallet-button` that survives both earlier probes really is the disconnected one.
 */
export type WalletState = "locked" | "eth-only" | "connected" | "disconnected";

async function isVisible(locator: Locator): Promise<boolean> {
  return locator.isVisible().catch(() => false);
}

/** Read the navbar's current wallet state. See `selectors.ts` for the control-per-state mapping. */
export async function readWalletState(page: Page): Promise<WalletState> {
  if (await isVisible(unlockBtcButton(page))) return "locked";
  if (await isVisible(connectBtcButton(page))) return "eth-only";
  if (await isVisible(walletMenuTrigger(page))) return "connected";
  return "disconnected";
}

/**
 * Poll the navbar until it reaches `expected`, actively sweeping approval popups. MetaMask can insert
 * an EXTRA approval AFTER the initial connect — a "Review permissions / Use your enabled networks"
 * prompt whose Confirm (page-container-footer-next) must be clicked before the app flips to connected.
 * That prompt can land after the popup approver's per-window rounds have ended (or in a reused window
 * that fires no 'page' event), so a one-shot waitFor would just time out with it hanging. Sweeping each
 * tick clicks it (clickApprove already matches that Confirm), the same way the borrow/repay loops do.
 */
async function waitForWalletState(
  ctx: ActionContext,
  expected: WalletState,
): Promise<void> {
  const { page, context, log } = ctx;
  const deadline = Date.now() + CONNECT_STATE_TIMEOUT_MS;
  let lastState: WalletState | undefined;
  while (Date.now() < deadline) {
    const state = await readWalletState(page);
    if (state === expected) return;
    if (state !== lastState) {
      lastState = state;
      log(`Wallet state → ${state}`);
    }
    await sweepApprovals(context, page, log);
    await page.waitForTimeout(CONNECT_STATE_POLL_MS);
  }
  const cause =
    expected === "connected" && lastState === "eth-only"
      ? 'the Bitcoin connect did not take — the app is connected with Ethereum alone (its "Connect BTC" control is still shown), so the extension approval was declined or never arrived'
      : 'a wallet approval popup (e.g. MetaMask "Review permissions") may be unconfirmed';
  throw new Error(
    `connect: the app did not reach the "${expected}" wallet state within ${Math.round(CONNECT_STATE_TIMEOUT_MS / MS_PER_SECOND)}s (last seen "${lastState ?? "unknown"}") — ${cause}.`,
  );
}

/** Pick this run's BTC wallet from the dialog's WALLETS screen and let its approval popup settle. */
async function chooseBtcWallet(ctx: ActionContext): Promise<void> {
  const { page, log } = ctx;
  log(`Selecting BTC wallet: ${ctx.btc.id}`);
  await btcWalletOption(page, ctx.btc.id).click({ timeout: STEP_TIMEOUT_MS });
  await page.waitForTimeout(APPROVAL_WAIT_MS);
}

/**
 * Click the dialog's CHAINS-screen "Connect" to confirm the session and close the dialog. Tolerated
 * as best-effort (as it always has been): a session that is already confirmed can close on its own.
 */
async function finalizeWalletDialog(
  page: Page,
  log: (m: string) => void,
): Promise<void> {
  log("Finalizing (Connect)");
  await page
    .locator(CHAINS_CONNECT_TESTID)
    .click({ timeout: STEP_TIMEOUT_MS })
    .catch(() => {});
}

/**
 * Drive an ALREADY-OPEN wallet dialog sitting on the Bitcoin wallet list through to a connected BTC
 * wallet. Used by the just-in-time prompt (a deposit CTA opened the dialog) and by
 * `connectBtcFromNavbar`. Selecting a BTC wallet returns the dialog to its CHAINS screen, so the
 * confirm click is still needed to close it.
 */
export async function completeBtcWalletDialog(
  ctx: ActionContext,
): Promise<void> {
  await chooseBtcWallet(ctx);
  await finalizeWalletDialog(ctx.page, ctx.log);
  await waitForWalletState(ctx, "connected");
}

/** Add Bitcoin to an Ethereum-only session from the navbar's "Connect BTC" control. */
export async function connectBtcFromNavbar(ctx: ActionContext): Promise<void> {
  await connectBtcButton(ctx.page).click({ timeout: STEP_TIMEOUT_MS });
  await completeBtcWalletDialog(ctx);
}

export interface ConnectWalletsOptions {
  /**
   * Also connect the Bitcoin wallet (default). Pass `false` for the Ethereum-only entry: the app
   * session only requires Ethereum, and Bitcoin is then connected just-in-time.
   */
  btc?: boolean;
}

/**
 * Drive the connect flow to the connected state. Requires an active pop-up approver on `ctx.context`.
 */
export async function connectWallets(
  ctx: ActionContext,
  options: ConnectWalletsOptions = {},
): Promise<void> {
  const { page, log } = ctx;
  const withBtc = options.btc ?? true;

  // A connected session whose BTC extension has silently locked renders an Unlock control where the
  // Connect button would be — and on a build without its own testid that control answers to
  // `connect-wallet-button`. Clicking it would only re-fire the extension's unlock prompt, then wait
  // out the whole budget for a state this run cannot reach. Fail fast with what the human must do.
  if (await isVisible(unlockBtcButton(page)))
    throw new Error(
      "connect: the BTC wallet is locked — the app holds a connected session but the extension is locked. Unlock the extension (and clear its auto-lock timer) and re-run.",
    );

  log("Clicking Connect");
  await page
    .locator(CONNECT_WALLET_TESTID)
    .first()
    .click({ timeout: STEP_TIMEOUT_MS });

  if (withBtc) {
    await page
      .locator(SELECT_BITCOIN_WALLET_TESTID)
      .click({ timeout: STEP_TIMEOUT_MS });
    await chooseBtcWallet(ctx);
  }

  log(`Selecting ETH wallet: ${ctx.eth.id}`);
  await page
    .locator(SELECT_ETHEREUM_WALLET_TESTID)
    .click({ timeout: STEP_TIMEOUT_MS });
  await page
    .getByText(ETH_APPKIT_NAME[ctx.eth.id] ?? /metamask/i, { exact: false })
    .first()
    .click({ timeout: STEP_TIMEOUT_MS });
  await page.waitForTimeout(APPROVAL_WAIT_MS);

  await finalizeWalletDialog(page, log);

  const expected: WalletState = withBtc ? "connected" : "eth-only";
  log(`Waiting for the connected state (${expected})`);
  await waitForWalletState(ctx, expected);
}

/**
 * Open the connected wallet menu. core-ui's `Menu` clones the trigger (the avatar group) and adds
 * `aria-haspopup="true"` + toggles `aria-expanded`, rendering the address cards in a Popover when open.
 * Click the haspopup trigger and confirm the menu opened (retry with the avatar image as a fallback).
 *
 * "Opened" is read off the ETHEREUM card: it renders in BOTH menu variants (core-ui's `WalletMenu`
 * draws a card per address it is given, and Ethereum is the one address every connected session has),
 * whereas the Bitcoin card only exists in the both-wallets `BtcEthWalletMenu`.
 */
export async function openWalletMenu(
  page: Page,
  log: (m: string) => void,
  menuOpenTimeoutMs: number,
  headerSettleMs: number,
): Promise<void> {
  const isOpen = () =>
    page
      .getByText(ETHEREUM_WALLET_CARD, { exact: true })
      .first()
      .waitFor({ state: "visible", timeout: menuOpenTimeoutMs })
      .then(() => true)
      .catch(() => false);

  const trigger = walletMenuTrigger(page);
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

/**
 * Verify one chain's address in the open wallet menu. The card renders the address via core-ui's
 * `DisplayHash` as a truncated `first6...last6` string, which `addrMatches` compares against the full
 * expected address by prefix + suffix. We read it straight from the DOM (no clipboard) — clipboard
 * reads throw "Document is not focused" whenever a popup holds focus, and clicking copy would swap the
 * address node for a "Copied ✓" label. The label ("{walletLabel} Wallet") is stripped before matching.
 */
export async function verifyMenuAddress(
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
