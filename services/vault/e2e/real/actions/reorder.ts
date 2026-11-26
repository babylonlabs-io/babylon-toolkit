/**
 * The "reorder" action: #2827 end to end on real Sepolia. A depositor who rejects a reorder in the
 * wallet must be able to reorder again, with no reload, and the dialog's network fee must not read as
 * zero.
 *
 * One journey, on /vaults:
 *   1. Open "Reorder" and move the 2nd BTC Vault up. The "Ethereum network fee" row must not read zero
 *      (a Sepolia fee is about 2e-12 ETH, which the app once rounded to "0.000000 ETH").
 *   2. Confirm, and click Reject in MetaMask's own window. The dialog must show "Transaction failed" with
 *      the wallet-rejection message, and the account must have sent nothing.
 *   3. Close the dialog and open it again. It must not still show that failure: the dialog stays mounted
 *      while closed, and its failure once outlived it until a reload.
 *   4. Move the 2nd BTC Vault up again and confirm (the approver confirms MetaMask). The on-chain order
 *      must then be the starting order with its first two BTC Vaults swapped, from one transaction.
 *
 * Nothing may navigate or reload between steps 2 and 3: a remount of /vaults drops the stale failure
 * on its own, and the run would then pass on a build that has the bug.
 *
 * A reorder needs two active BTC Vaults. `--pegin-first` pegs in the missing ones first; the CLI decides
 * how many from the position (a two-vault split from none, a single vault from one) and refuses a run
 * that is short without it.
 *
 * NEVER run without an explicit go-ahead: it sends one Sepolia transaction, and with `--pegin-first` a
 * whole peg-in (signet BTC and Sepolia ETH).
 */
import type { BrowserContext, Locator, Page } from "@playwright/test";
import type { Hex } from "viem";

import { fetchVaultOrder } from "../borrowParams";
import { EXTENSION_CHROME_STORE_IDS, runtimeExtensionId } from "../connector";
import { readPendingNonce } from "../positionCapacityParams";
import {
  APPROVE_CLICK_TIMEOUT_MS,
  FORM_SETTLE_MS,
  MS_PER_SECOND,
  REORDER_BUTTON_ENABLE_TIMEOUT_MS,
  REORDER_TX_TIMEOUT_MS,
  REORDER_VERIFY_POLL_MS,
  REORDER_WALLET_PROMPT_TIMEOUT_MS,
  STEP_TIMEOUT_MS,
} from "../timing";
import { centerWindow } from "../windowUtils";

import {
  installPopupApprover,
  METAMASK_CONFIRM_FOOTER_TESTID,
  sweepApprovals,
} from "./approver";
import { goToSection, SECTION_PATHS } from "./navigation";
import { runPeginFlow } from "./pegin";
import { startRecording } from "./recording";
import {
  COLLATERAL_LIST_INCOMPLETE_TESTID,
  DONE_BUTTON_RX,
  readTxFailedText,
  TX_FAILED_RX,
  UNCONFIRMED_WRITE_TITLE_RX,
} from "./selectors";
import type { Action, ActionContext } from "./types";
import { connectWallets } from "./walletConnect";

/**
 * The BTC Vaults a reorder needs. KEEP IN SYNC with `canReorder` in src/components/pages/VaultsPage.tsx
 * (mirrored, not imported: the e2e layer does not import from `src/`).
 */
export const MIN_REORDER_VAULTS = 2;

/** Why a run cannot reorder a position holding `count` active BTC Vaults, and what to re-run with. */
export function notEnoughReorderVaultsMessage(count: number): string {
  return `Reorder needs ${MIN_REORDER_VAULTS} active BTC Vaults; this position holds ${count}. Re-run with --pegin-first: it pegs in a two-vault split from 0 BTC Vaults, a single vault from 1.`;
}

// ── Reorder selectors ──────────────────────────────────────────────────────────
// The app's literals are mirrored with their copy.ts source, as elsewhere in e2e/real.
/** The /vaults Reorder card's button (VaultsSummaryCard). Its `disabled` state is the app's own gate. */
const REORDER_BUTTON_TESTID = '[data-testid="vaults-reorder-button"]';
/** The dialog's "Ethereum network fee" row (ReorderVaultsModal); rendered only once the order changed. */
const NETWORK_FEE_TESTID = '[data-testid="reorder-network-fee"]';
/** core-ui FullScreenDialog's root, which every V3ModalShell overlay renders into. */
const DIALOG_SELECTOR = ".bbn-dialog-fullscreen";
/** COPY.reorder.modalTitle */
const REORDER_DIALOG_TITLE = "Reorder Vaults";
/** COPY.reorder.successTitle */
const REORDER_SUCCESS_TITLE = "BTCVault order updated";
/** COPY.reorder.moveUp(formatOrdinal(2)) */
const MOVE_SECOND_UP_LABEL = "Move 2nd BTCVault up";
/** COPY.reorder.confirmButton — "Confirming..." while busy, which this exact name does not match. */
const CONFIRM_LABEL = "Confirm";
/** COPY.common.close — V3ModalShell's close button. */
const CLOSE_LABEL = "Close";
/** COPY.reorder.networkFeeLabel, stripped from the fee row's text. */
const NETWORK_FEE_LABEL = "Ethereum network fee";
/** COPY.reorder.networkFeeEstimating */
const FEE_ESTIMATING_RX = /estimating/i;
/** COPY.reorder.networkFeeUnavailable */
const FEE_UNAVAILABLE_RX = /--\s*ETH/;
/** A fee rendered as zero, e.g. "0.000000 ETH ($0.00 USD)". Does not match "< 0.000001 ETH (< $0.01 USD)". */
const ZERO_FEE_RX = /(?:^|\s)0(?:\.0+)?\s*ETH|\$0\.00(?!\d)/;
/** The app's message for a prompt the wallet refused (`getEnhancedErrorMessage` in src/utils/errors/contract.ts). */
const WALLET_REJECTED_RX = /rejected by the wallet/i;

// MetaMask's transaction confirmation. MetaMask is not version-pinned (the harness downloads the latest
// Web Store build), so each control has a role fallback next to its testid.
const METAMASK_CONFIRM_NAME_RX = /^confirm$/i;
const METAMASK_CANCEL_TESTIDS = [
  '[data-testid="confirm-footer-cancel-button"]',
  '[data-testid="page-container-footer-cancel"]',
].join(", ");
const METAMASK_CANCEL_NAME_RX = /^(cancel|reject)$/i;

function seconds(ms: number): number {
  return Math.round(ms / MS_PER_SECOND);
}

/** The V3ModalShell overlay whose heading is `title`. */
function dialogTitled(page: Page, title: string): Locator {
  return page.locator(DIALOG_SELECTOR).filter({
    has: page.getByRole("heading", { name: title, exact: true }),
  });
}

function failureAlert(dialog: Locator): Locator {
  return dialog.getByRole("alert").filter({ hasText: TX_FAILED_RX }).first();
}

function confirmButton(dialog: Locator): Locator {
  return dialog.getByRole("button", { name: CONFIRM_LABEL, exact: true });
}

/**
 * The text of the dialog's notice, whitespace-collapsed: an outcome that is not a failure, such as a
 * refusal before signing (core-ui `Callout` renders every non-error variant with role="status"). The
 * empty dnd-kit live region shares the role, so only a status with text counts. Empty when none.
 */
async function readNoticeText(dialog: Locator): Promise<string> {
  const notice = dialog.getByRole("status").filter({ hasText: /\S/ }).first();
  if (!(await notice.isVisible().catch(() => false))) return "";
  return (await notice.innerText().catch(() => "")).replace(/\s+/g, " ").trim();
}

function sameOrder(a: readonly Hex[], b: readonly Hex[]): boolean {
  return (
    a.length === b.length &&
    a.every((id, index) => id.toLowerCase() === b[index].toLowerCase())
  );
}

/** MetaMask's open approval windows (`notification.html`, the harness keeps MetaMask in pop-up mode). */
function metaMaskWindows(context: BrowserContext, prefix: string): Page[] {
  return context
    .pages()
    .filter((popup) => !popup.isClosed() && popup.url().startsWith(prefix));
}

/**
 * On /vaults, wait for the Reorder button to enable, click it and return the dialog. A disabled button
 * is waited out rather than failed at once: right after a peg-in the indexer can still lag the chain.
 */
async function openReorderDialog(
  page: Page,
  log: (m: string) => void,
): Promise<Locator> {
  // No role-name fallback: a build without this testid also lacks the fee row's, so the run could
  // not get past the fee check on it anyway.
  const button = page.locator(REORDER_BUTTON_TESTID).first();
  const deadline = Date.now() + REORDER_BUTTON_ENABLE_TIMEOUT_MS;
  while (!(await button.isEnabled().catch(() => false))) {
    if (Date.now() > deadline) {
      if ((await button.count()) === 0)
        throw new Error(
          `No ${REORDER_BUTTON_TESTID} appeared on ${SECTION_PATHS.vaults} within ${seconds(REORDER_BUTTON_ENABLE_TIMEOUT_MS)}s; a build that predates this testid shows its Reorder button without it.`,
        );
      const lagging = await page
        .locator(COLLATERAL_LIST_INCOMPLETE_TESTID)
        .isVisible()
        .catch(() => false);
      throw new Error(
        lagging
          ? `Reorder stayed disabled for ${seconds(REORDER_BUTTON_ENABLE_TIMEOUT_MS)}s: the indexed vault list does not match the chain position yet (indexer lag). Re-run once it catches up.`
          : `Reorder stayed disabled for ${seconds(REORDER_BUTTON_ENABLE_TIMEOUT_MS)}s: fewer than ${MIN_REORDER_VAULTS} active BTC Vaults are listed (an activating one does not count), or the protocol froze or paused reorders.`,
      );
    }
    await page.waitForTimeout(FORM_SETTLE_MS);
  }

  log("Opening the Reorder dialog");
  await button.click({ timeout: STEP_TIMEOUT_MS });
  const dialog = dialogTitled(page, REORDER_DIALOG_TITLE);
  await dialog.waitFor({ state: "visible", timeout: STEP_TIMEOUT_MS });
  return dialog;
}

async function moveSecondVaultUp(dialog: Locator): Promise<void> {
  await dialog
    .getByRole("button", { name: MOVE_SECOND_UP_LABEL, exact: true })
    .click({ timeout: STEP_TIMEOUT_MS });
}

/**
 * The fee row's value once it is no longer "Estimating...". Throws on a fee the app could not estimate
 * (the run would prove nothing) and on a fee rendered as zero (#2827).
 */
async function assertFeeNotZero(
  page: Page,
  dialog: Locator,
  log: (m: string) => void,
): Promise<void> {
  const row = dialog.locator(NETWORK_FEE_TESTID).first();
  const deadline = Date.now() + STEP_TIMEOUT_MS;
  let fee = "";
  for (;;) {
    fee = (await row.innerText({ timeout: FORM_SETTLE_MS }).catch(() => ""))
      .replace(NETWORK_FEE_LABEL, "")
      .replace(/\s+/g, " ")
      .trim();
    if (fee !== "" && !FEE_ESTIMATING_RX.test(fee)) break;
    if (Date.now() > deadline)
      throw new Error(
        `The Reorder dialog's network fee did not settle within ${seconds(STEP_TIMEOUT_MS)}s (last read: "${fee}").`,
      );
    await page.waitForTimeout(FORM_SETTLE_MS);
  }

  log(`Network fee shown: ${fee}`);
  if (FEE_UNAVAILABLE_RX.test(fee))
    throw new Error(
      `Inconclusive: the app could not estimate the reorder's gas ("${fee}"). A position below health factor 1 makes the reorder revert (#2932); otherwise check the Sepolia RPC.`,
    );
  if (ZERO_FEE_RX.test(fee))
    throw new Error(
      `#2827: the Reorder dialog's network fee reads "${fee}" — a non-zero fee rendered as zero.`,
    );
}

/**
 * After the dialog's Confirm, find MetaMask's transaction confirmation and click its Reject. Windows are
 * polled rather than awaited as `page` events, so a reused MetaMask window is found too. A window counts
 * only while it shows a Confirm control, and the caller requires no MetaMask window to be open before the
 * dialog's Confirm, so the first window to show one is taken as the reorder's. A different MetaMask
 * prompt raised in that interval would be rejected instead.
 */
async function rejectInMetaMask(
  ctx: ActionContext,
  dialog: Locator,
  windowPrefix: string,
): Promise<void> {
  const { page, context, log } = ctx;
  const deadline = Date.now() + REORDER_WALLET_PROMPT_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (
      await failureAlert(dialog)
        .isVisible()
        .catch(() => false)
    )
      throw new Error(
        `The reorder failed before asking the wallet: "${await readTxFailedText(dialog)}".`,
      );
    const notice = await readNoticeText(dialog);
    if (notice !== "")
      throw new Error(
        `The app did not ask the wallet; the Reorder dialog shows: "${notice}".`,
      );
    for (const popup of metaMaskWindows(context, windowPrefix)) {
      const confirm = popup
        .locator(METAMASK_CONFIRM_FOOTER_TESTID)
        .or(popup.getByRole("button", { name: METAMASK_CONFIRM_NAME_RX }))
        .first();
      if (!(await confirm.isVisible().catch(() => false))) continue;
      await centerWindow(popup).catch(() => {});
      const rejected = await popup
        .locator(METAMASK_CANCEL_TESTIDS)
        .or(popup.getByRole("button", { name: METAMASK_CANCEL_NAME_RX }))
        .first()
        .click({ timeout: APPROVE_CLICK_TIMEOUT_MS })
        .then(() => true)
        .catch(() => false);
      if (rejected) {
        log("Rejected the reorder in MetaMask");
        return;
      }
    }
    await page.waitForTimeout(FORM_SETTLE_MS);
  }
  throw new Error(
    `MetaMask showed no transaction confirmation within ${seconds(REORDER_WALLET_PROMPT_TIMEOUT_MS)}s of Confirm. If no MetaMask window opened, MetaMask may be in side-panel mode, which Playwright cannot see (see usePopupApprovals in the MetaMask fixture).`,
  );
}

/**
 * Step 2: Confirm, reject in MetaMask, and require the wallet-rejection failure with nothing sent. The
 * approver must be detached by the caller, and nothing that sweeps approvals may run until the reject.
 */
async function confirmAndRejectInWallet(
  ctx: ActionContext,
  dialog: Locator,
  nonceBefore: number,
): Promise<void> {
  const { page, context, log, config } = ctx;
  const windowPrefix = `chrome-extension://${runtimeExtensionId(EXTENSION_CHROME_STORE_IDS.METAMASK)}/notification.html`;

  // A MetaMask window left open (e.g. by connect) could be reused for the prompt while an approver loop
  // still runs on it, which would confirm instead of reject.
  const deadline = Date.now() + STEP_TIMEOUT_MS;
  while (metaMaskWindows(context, windowPrefix).length > 0) {
    if (Date.now() > deadline)
      throw new Error(
        `A MetaMask window is still open (${metaMaskWindows(context, windowPrefix)[0]?.url()}); the run cannot tell its prompt apart from the reorder's. Close it and re-run.`,
      );
    await page.waitForTimeout(FORM_SETTLE_MS);
  }

  log("Confirming the reorder, to reject it in MetaMask");
  await confirmButton(dialog).click({ timeout: STEP_TIMEOUT_MS });
  await rejectInMetaMask(ctx, dialog, windowPrefix);

  const appeared = await failureAlert(dialog)
    .waitFor({ state: "visible", timeout: STEP_TIMEOUT_MS })
    .then(() => true)
    .catch(() => false);
  if (!appeared)
    throw new Error(
      `The Reorder dialog showed no "Transaction failed" within ${seconds(STEP_TIMEOUT_MS)}s of the MetaMask rejection. See trace.zip for what it showed instead.`,
    );
  const failure = await readTxFailedText(dialog);
  if (!WALLET_REJECTED_RX.test(failure))
    throw new Error(
      `The rejected reorder failed with "${failure}", not the wallet rejection.`,
    );
  log(`The dialog shows the rejection: "${failure}"`);

  const nonceAfter = await readPendingNonce(config.network, ctx.eth.address);
  if (nonceAfter !== nonceBefore)
    throw new Error(
      `The account's pending nonce moved from ${nonceBefore} to ${nonceAfter} after the reorder was rejected in MetaMask: a transaction was sent.`,
    );
}

/**
 * Step 3, the #2827 check: close the dialog and open it again on the same page. It must start clean:
 * no failure from the rejected attempt, and the on-chain order (no fee row, Confirm disabled), so the
 * single move in step 4 swaps exactly the first two BTC Vaults.
 */
async function reopenWithoutStaleFailure(
  page: Page,
  dialog: Locator,
  log: (m: string) => void,
): Promise<Locator> {
  await dialog
    .getByRole("button", { name: CLOSE_LABEL, exact: true })
    .first()
    .click({ timeout: STEP_TIMEOUT_MS });
  await dialog.waitFor({ state: "hidden", timeout: STEP_TIMEOUT_MS });

  const path = new URL(page.url()).pathname;
  if (path !== SECTION_PATHS.vaults)
    throw new Error(
      `Closing the Reorder dialog left ${SECTION_PATHS.vaults} (now ${path}); a remount drops the stale failure on its own, so the #2827 check would prove nothing.`,
    );

  const reopened = await openReorderDialog(page, log);
  await page.waitForTimeout(FORM_SETTLE_MS);
  if (
    await failureAlert(reopened)
      .isVisible()
      .catch(() => false)
  )
    throw new Error(
      `#2827: the Reorder dialog still shows "${await readTxFailedText(reopened)}" after it was closed and reopened — the wallet rejection's failure outlived the dialog.`,
    );
  const confirmEnabled = await confirmButton(reopened)
    .isEnabled({ timeout: STEP_TIMEOUT_MS })
    .catch(() => null);
  if (confirmEnabled === null)
    throw new Error(
      `The reopened Reorder dialog shows no "${CONFIRM_LABEL}" button within ${seconds(STEP_TIMEOUT_MS)}s; it reads "Confirming..." while an Aave write holds the lock.`,
    );
  if (
    (await reopened.locator(NETWORK_FEE_TESTID).count()) > 0 ||
    confirmEnabled
  )
    throw new Error(
      "The reopened Reorder dialog did not start from the on-chain order (a fee row is shown or Confirm is enabled).",
    );
  log(
    "✅ The reopened Reorder dialog does not show the rejected attempt's failure",
  );
  return reopened;
}

/** Step 4: confirm the reorder (the approver confirms MetaMask) and dismiss the success dialog. */
async function confirmReorder(
  ctx: ActionContext,
  dialog: Locator,
): Promise<void> {
  const { page, context, log } = ctx;
  const confirm = confirmButton(dialog);
  const enabled = await confirm
    .waitFor({ state: "visible", timeout: STEP_TIMEOUT_MS })
    .then(async () => {
      const deadline = Date.now() + STEP_TIMEOUT_MS;
      while (!(await confirm.isEnabled().catch(() => false))) {
        if (Date.now() > deadline) return false;
        await page.waitForTimeout(FORM_SETTLE_MS);
      }
      return true;
    })
    .catch(() => false);
  if (!enabled)
    throw new Error(
      `The Reorder dialog's Confirm stayed disabled for ${seconds(STEP_TIMEOUT_MS)}s after the rejection — the app's Aave write lock may still be held.`,
    );
  log("Confirming the reorder (the approver confirms MetaMask)");
  await confirm.click({ timeout: STEP_TIMEOUT_MS });

  const success = dialogTitled(page, REORDER_SUCCESS_TITLE);
  const waiting = dialog.getByText(UNCONFIRMED_WRITE_TITLE_RX).first();
  let loggedWaiting = false;
  const deadline = Date.now() + REORDER_TX_TIMEOUT_MS;
  while (Date.now() < deadline) {
    await sweepApprovals(context, page, log);
    if (await success.isVisible().catch(() => false)) {
      log("✅ Reorder confirmed — clicking Done");
      await success
        .getByRole("button", { name: DONE_BUTTON_RX })
        .click({ timeout: STEP_TIMEOUT_MS });
      await success.waitFor({ state: "hidden", timeout: STEP_TIMEOUT_MS });
      return;
    }
    if (
      await failureAlert(dialog)
        .isVisible()
        .catch(() => false)
    )
      throw new Error(
        `The confirmed reorder failed: "${await readTxFailedText(dialog)}".`,
      );
    // Any notice but the waiting callout ends the attempt without a success: a refusal before
    // signing (a wallet transaction in flight, another write holding the lock) or an outcome that
    // may have done the reorder (possibly replaced, possibly sent). A revert or a definite
    // replacement is a failure, caught above.
    const notice = await readNoticeText(dialog);
    if (notice !== "" && !UNCONFIRMED_WRITE_TITLE_RX.test(notice))
      throw new Error(
        `The confirmed reorder ended without a success: "${notice}". Check the position's order before re-running.`,
      );
    if (!loggedWaiting && (await waiting.isVisible().catch(() => false))) {
      log("The reorder was sent and is waiting for confirmation");
      loggedWaiting = true;
    }
    await page.waitForTimeout(FORM_SETTLE_MS);
  }
  throw new Error(
    `The reorder did not reach "${REORDER_SUCCESS_TITLE}" within ${seconds(REORDER_TX_TIMEOUT_MS)}s${loggedWaiting ? " (it was sent and was waiting for confirmation)" : ""}. It may still be mined: check the position's order before re-running.`,
  );
}

/** The end state: the on-chain order is `expected`, from exactly one transaction since `nonceBefore`. */
async function assertOrderSwappedOnChain(
  ctx: ActionContext,
  baseline: readonly Hex[],
  expected: readonly Hex[],
  nonceBefore: number,
): Promise<void> {
  const { page, log, config } = ctx;
  const deadline = Date.now() + REORDER_TX_TIMEOUT_MS;
  let last: Hex[] | null = null;
  while (Date.now() < deadline) {
    last = await fetchVaultOrder(config.network, ctx.eth.address).catch(
      () => last,
    );
    if (last && sameOrder(last, expected)) break;
    await page.waitForTimeout(REORDER_VERIFY_POLL_MS);
  }
  if (!last)
    throw new Error(
      `The reorder reached the success dialog but the on-chain order could not be read within ${seconds(REORDER_TX_TIMEOUT_MS)}s, so it is unverified. Check the Sepolia RPC and the position manually.`,
    );
  if (sameOrder(last, baseline))
    throw new Error(
      `The reorder reached the success dialog but the on-chain order is still the starting order after ${seconds(REORDER_TX_TIMEOUT_MS)}s: the reorder did not take effect.`,
    );
  if (!sameOrder(last, expected))
    throw new Error(
      `The on-chain order is ${last.join(", ")}, not the expected ${expected.join(", ")}.`,
    );

  const nonceAfter = await readPendingNonce(config.network, ctx.eth.address);
  if (nonceAfter !== nonceBefore + 1)
    throw new Error(
      `The account sent ${nonceAfter - nonceBefore} transactions during the run, not 1: none for the rejected reorder and one for the confirmed one.`,
    );
  log(`✅ On-chain order swapped: ${last.join(", ")}`);
}

export const reorderAction: Action = {
  id: "reorder",
  async run(ctx: ActionContext): Promise<void> {
    const { page, context, log, artifactsDir, config } = ctx;

    let approver: ((popup: Page) => void) | undefined = installPopupApprover(
      context,
      log,
    );
    let currentStep = "connect";
    const onStep = (step: string) => {
      currentStep = step;
    };
    const recorder = await startRecording(
      context,
      page,
      artifactsDir,
      log,
      () => currentStep,
    );
    try {
      await connectWallets(ctx);

      if (config.peginFirst) {
        log(
          `Reorder --pegin-first: pegging in ${config.split ? "a two-vault split" : "a single vault"} first`,
        );
        await runPeginFlow(ctx, (step) => onStep(`pegin:${step}`));
      }

      onStep("baseline");
      const baseline = await fetchVaultOrder(
        config.network,
        ctx.eth.address,
      ).catch((error: unknown) => {
        throw new Error(
          `reorder: could not read the on-chain order before reordering (${error instanceof Error ? error.message : error}), so the run would be unverifiable. Re-run against a reachable Sepolia RPC.`,
        );
      });
      if (baseline.length < MIN_REORDER_VAULTS)
        throw new Error(notEnoughReorderVaultsMessage(baseline.length));
      const expected = [baseline[1], baseline[0], ...baseline.slice(2)];
      log(`On-chain order: ${baseline.join(", ")}`);
      log(`Expected after the reorder: ${expected.join(", ")}`);

      onStep("open");
      await goToSection(page, "vaults", log);
      const dialog = await openReorderDialog(page, log);

      onStep("fee");
      await moveSecondVaultUp(dialog);
      await assertFeeNotZero(page, dialog, log);

      // From here to the confirm below nothing may approve MetaMask: the approver is detached and no
      // helper that sweeps approvals (connect, the pegin walk, a loan or withdraw flow) runs.
      onStep("reject");
      context.off("page", approver);
      approver = undefined;
      log("Popup approver detached, to reject the reorder in MetaMask");
      const nonceBefore = await readPendingNonce(
        config.network,
        ctx.eth.address,
      );
      await confirmAndRejectInWallet(ctx, dialog, nonceBefore);

      onStep("reopen");
      const reopened = await reopenWithoutStaleFailure(page, dialog, log);

      onStep("confirm");
      await moveSecondVaultUp(reopened);
      approver = installPopupApprover(context, log);
      await confirmReorder(ctx, reopened);

      onStep("verify");
      await assertOrderSwappedOnChain(ctx, baseline, expected, nonceBefore);
      log(
        "✅ Reorder complete: rejected once with nothing sent, no stale failure on reopen, then the first two BTC Vaults swapped on chain.",
      );
    } finally {
      await recorder.stop();
      if (approver) context.off("page", approver);
    }
  },
};
