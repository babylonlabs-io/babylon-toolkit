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
 * Under `--eth-only` the two Bitcoin steps are skipped and the rest is unchanged, so the app reaches
 * the connected state on a confirmed Ethereum wallet alone — what `useConnection` allows. The Bitcoin
 * row is marked `data-optional="true"` by every build with Ethereum-only access, which is read here to
 * fail an `--eth-only` run against an older build by name, rather than letting it time out later on a
 * control that was never going to appear.
 *
 * The connected-state signal is the header's wallet-menu trigger, NOT a page CTA: v3 splits the old
 * dashboard across routes, so the deposit CTA now lives on /vaults only. The menu trigger renders on
 * every route the moment the app counts the session as connected.
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

/** The Bitcoin row's testid on the connect screen — the step `--eth-only` skips. */
const SELECT_BTC_TESTID = '[data-testid="select-bitcoin-wallet-button"]';

/**
 * The attribute the connect screen sets to "true" on a chain that is not required, from `ChainButton`
 * in packages/babylon-wallet-connector/src/components/ChainButton/index.tsx. Its presence on the
 * Bitcoin row is the build's own statement that it has Ethereum-only access, so it is the cheapest
 * proof that the served bundle matches the run being asked for.
 */
const OPTIONAL_CHAIN_ATTRIBUTE = "data-optional";

/**
 * The connected wallet inside the Bitcoin row. `ConnectedWallet` in
 * packages/babylon-wallet-connector/src/components/ConnectedWallet/index.tsx is the only element in the
 * row that carries a `title` (the full address), and the row renders it only once a Bitcoin wallet is
 * connected.
 */
const CONNECTED_BTC_WALLET = `${SELECT_BTC_TESTID} [title]`;

/**
 * Read the Bitcoin row and check the served build against the run.
 *
 * `--eth-only` REQUIRES the row to be marked optional: without Ethereum-only access the connect screen
 * still demands Bitcoin, so the run could never reach the connected state and refusing here names the
 * cause instead of timing out later.
 */
async function checkBitcoinRowAgainstRun(
  page: Page,
  ethOnly: boolean,
): Promise<void> {
  const row = page.locator(SELECT_BTC_TESTID);
  try {
    await row.waitFor({ state: "visible", timeout: STEP_TIMEOUT_MS });
  } catch (error) {
    throw new Error(
      `connect: no Bitcoin wallet row appeared on the connect screen within ${STEP_TIMEOUT_MS} ms. Either the connect modal did not open, or the page is not the vault app (on localhost, devServer.ts reuses whatever already answers on its port).`,
      { cause: error },
    );
  }
  const isOptional =
    (await row.getAttribute(OPTIONAL_CHAIN_ATTRIBUTE)) === "true";
  if (ethOnly && !isOptional)
    throw new Error(
      `connect: --eth-only, but the connect screen's Bitcoin row is not marked ${OPTIONAL_CHAIN_ATTRIBUTE}="true", so the served build still requires Bitcoin. Possible causes: the served build predates Ethereum-only access (a deployed site not yet released with it, or a dev server left running on this port, which is reused as-is, so stop it and re-run); the wallet-connector dist predates the ${OPTIONAL_CHAIN_ATTRIBUTE} marker (rebuild it); or the connector renamed the ${OPTIONAL_CHAIN_ATTRIBUTE} attribute (update OPTIONAL_CHAIN_ATTRIBUTE).`,
    );
}

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
 * renders ONLY once the app counts the session connected and on EVERY route, which makes it both the
 * connected-state signal and the menu trigger.
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

  const ethOnly = Boolean(ctx.config.ethOnly);
  await checkBitcoinRowAgainstRun(page, ethOnly);

  if (ethOnly) {
    // Deliberately no Bitcoin click: the app must reach the connected state on Ethereum alone. The
    // extension is still installed and imported (run.ts), so this proves "no Bitcoin wallet CONNECTED",
    // which is what `useConnection` reads — not "no Bitcoin wallet present".
    log("Skipping BTC wallet (--eth-only)");
  } else {
    log(`Selecting BTC wallet: ${ctx.btc.id}`);
    await page.locator(SELECT_BTC_TESTID).click({ timeout: STEP_TIMEOUT_MS });
    await page
      .locator(`[data-testid="wallet-option-${ctx.btc.id as BtcWalletId}"]`)
      .click({ timeout: STEP_TIMEOUT_MS });
    // Wait for the BTC approval popup to be handled and the app to register the address.
    await page.waitForTimeout(APPROVAL_WAIT_MS);
  }

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
  // until every required wallet has reported in, so a single early click is silently dropped and the
  // modal then sits open forever. The header can already show the connected wallet menu at that point,
  // so the menu alone is not proof of success — this only returns once the modal is actually GONE.
  // Leaving it open is what covered the app in a portal-root overlay and broke the first click after
  // connect.
  //
  // Ethereum is the only required wallet, so Connect enables without Bitcoin, and a rejected or failed
  // Bitcoin connect returns the modal to this screen as if nothing happened. A default run therefore
  // clicks Connect only once the Bitcoin row shows a connected wallet, so that case fails here, by name,
  // not at the first Bitcoin signature. A failure the dialog shows as an error screen (an outdated
  // wallet, a failed address check) stops the run earlier, at the Ethereum row.
  const finalize = page.locator('[data-testid="chains-connect-button"]');
  const walletMenu = page.locator(WALLET_MENU_TRIGGER_TESTID).first();
  const bitcoinWallet = page.locator(CONNECTED_BTC_WALLET).first();
  let bitcoinReady = ethOnly;
  // The chain screen is hidden behind the connector's loader while an Ethereum approval is pending, so
  // only a chain screen seen without Bitcoin puts the blame on Bitcoin.
  let chainScreenSeen = false;
  const deadline = Date.now() + CONNECT_STATE_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const modalOpen = await finalize.isVisible().catch(() => false);
    if (
      !modalOpen &&
      bitcoinReady &&
      (await walletMenu.isVisible().catch(() => false))
    )
      return;
    chainScreenSeen ||= modalOpen;
    if (modalOpen && !bitcoinReady)
      bitcoinReady = await bitcoinWallet.isVisible().catch(() => false);
    // Short timeout on purpose: the button is visible-but-disabled until every required wallet reports
    // in, and a full STEP_TIMEOUT_MS wait here would block the tick and starve the approval sweep below.
    if (modalOpen && bitcoinReady)
      await finalize.click({ timeout: CONNECT_STATE_POLL_MS }).catch(() => {});
    await sweepApprovals(context, page, log);
    await page.waitForTimeout(CONNECT_STATE_POLL_MS);
  }
  const waitedS = Math.round(CONNECT_STATE_TIMEOUT_MS / MS_PER_SECOND);
  if (chainScreenSeen && !bitcoinReady)
    throw new Error(
      `connect: the Connect Wallets modal never showed a connected Bitcoin wallet within ${waitedS}s — the ${ctx.btc.id} connect failed or was rejected. The app accepts Ethereum alone, so the run stops here instead of at the first Bitcoin signature.`,
    );
  throw new Error(
    `connect: the Connect Wallets modal did not close into the connected state (header wallet menu) within ${waitedS}s — a wallet approval (e.g. MetaMask "Review permissions") may be unconfirmed.`,
  );
}

/**
 * Open the connected wallet menu. core-ui's `Menu` clones the trigger (the avatar group) and adds
 * `aria-haspopup="true"` + toggles `aria-expanded`, rendering the address cards in a Popover when open.
 * Click the trigger and confirm the menu opened (one retry, since the header can swallow the first
 * click while it settles).
 *
 * `expectedCardLabel` is the card the caller knows must be there — "Bitcoin Wallet" for a default run,
 * "Ethereum Wallet" for `--eth-only`, where no Bitcoin card renders. It is the menu's open signal, so
 * naming the strictest card the run expects keeps a missing one failing here, quickly, rather than
 * later in a slower address check.
 */
export async function openWalletMenu(
  page: Page,
  log: (m: string) => void,
  menuOpenTimeoutMs: number,
  headerSettleMs: number,
  expectedCardLabel: string,
): Promise<void> {
  const isOpen = () =>
    page
      .getByText(expectedCardLabel, { exact: true })
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

  throw new Error(
    `Could not open the connected wallet menu (no "${expectedCardLabel}" card)`,
  );
}
