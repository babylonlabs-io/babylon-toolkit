/**
 * The "withdraw" action: release active BTC-Vault collateral back to the depositor, end-to-end on real
 * Sepolia. Withdraw is the lifecycle exit — it submits a SINGLE on-chain `withdrawCollaterals(vaultIds)`
 * transaction (one MetaMask pop-up, NO Bitcoin signing); the vault provider then drives the Bitcoin
 * claim → challenge → payout off-chain and the vault surfaces under "Pending Withdrawals".
 *
 * Shapes, selected by the CLI (the prerequisite legs run before the withdraw, each guarded so a failed
 * leg aborts the run rather than withdrawing against a half-built position):
 *   - AS-IS (default): withdraw against the current position. A vault is withdrawable while the projected
 *     health factor after removing it stays ≥ 1.0 — so with NO debt every active vault is freely
 *     withdrawable (mirrors src/applications/aave/utils/withdrawEligibility.ts). When the position still
 *     carries debt, some/all vaults may be HF-gated; the modal's per-vault checkbox + the Review screen's
 *     HF gate enforce that, and we surface it rather than guessing.
 *   - REPAY-FIRST (`--repay-first`): repay the outstanding debt in full (the shared `runRepayFlow` with
 *     the amount forced to Max), then withdraw — clearing the HF gate so collateral releases cleanly.
 *   - BORROW-FIRST (`--borrow-first`): borrow (the shared `runBorrowWithOptionalPegin`), then repay that
 *     loan in full, then withdraw — all in one session.
 *   - PEGIN-FIRST (`--pegin-first`): peg in fresh collateral (optionally `--split` for two vaults) ahead
 *     of the borrow, giving the full pegin → borrow → repay → withdraw lifecycle. The CLI's flag cascade
 *     (`--pegin-first ⟹ --borrow-first ⟹ --repay-first`) sets these, so this action just runs whichever
 *     legs are enabled in order.
 *
 * Click path (all modal-driven — unlike repay there is no route change):
 *   Collateral "⋯" menu → "Withdraw" → selection modal (checkbox list of vaults) → "Withdraw {amount}"
 *   → Review ("Confirm") → one MetaMask tx → "Withdrawal initiated" → "Done".
 *
 * Default selection is ONE vault (the first withdrawable), keeping the position alive for reuse;
 * `--withdraw-all` ticks every selectable vault. Selectors are testid-first (added to the src withdraw
 * controls, mirroring borrow/repay) with tolerant role/text fallbacks. No SDK / product logic is
 * reimplemented — the live modal + Review HF gate are authoritative.
 *
 * NEVER run without an explicit go-ahead: it moves real value (releases BTC collateral + real withdraw gas).
 */
import type { BrowserContext, Page } from "@playwright/test";

import { fetchCollateralSats } from "../borrowParams";
import { formatBtc } from "../preflight";
import {
  FORM_SETTLE_MS,
  MS_PER_SECOND,
  STEP_TIMEOUT_MS,
  WITHDRAW_CTA_ENABLE_TIMEOUT_MS,
  WITHDRAW_MENU_TIMEOUT_MS,
  WITHDRAW_MODAL_TIMEOUT_MS,
  WITHDRAW_TX_TIMEOUT_MS,
  WITHDRAW_VERIFY_POLL_MS,
} from "../timing";

import { installPopupApprover, sweepApprovals } from "./approver";
import { runBorrowWithOptionalPegin } from "./borrow";
import { startRecording } from "./recording";
import { runRepayFlow } from "./repay";
import { DONE_BUTTON_RX, firstByTestid, TX_FAILED_RX } from "./selectors";
import { type Action, type ActionContext } from "./types";
import { connectWallets } from "./walletConnect";

// ── Withdraw selectors (testid-first; tolerant role/text fallbacks) ──────────────
// Collateral summary card → "⋯" overflow menu (aria-label COPY.collateral.menu.triggerLabel).
const COLLATERAL_ACTIONS_TESTID = '[data-testid="collateral-actions-button"]';
const COLLATERAL_ACTIONS_RX = /collateral options/i;
// The "Withdraw" item inside the "⋯" menu (COPY.collateral.menu.withdraw). Disabled only when the
// protocol has paused withdrawals.
const WITHDRAW_MENU_TESTID = '[data-testid="collateral-withdraw-button"]';
const WITHDRAW_MENU_RX = /^withdraw$/i;
// Per-vault selection row in the modal: `withdraw-vault-row-<vaultId>`, each with a trailing checkbox.
const VAULT_ROW_TESTID_PREFIX = "withdraw-vault-row-";
const VAULT_ROW_SELECTOR = `[data-testid^="${VAULT_ROW_TESTID_PREFIX}"]`;
// The core-ui Checkbox renders a real <input type="checkbox">; it's `disabled` when the vault is not
// selectable (not in use, or HF-gated), which is exactly how we tell a withdrawable vault apart.
const VAULT_CHECKBOX_SELECTOR = 'input[type="checkbox"]';
// The selection modal's "Withdraw {amount}" confirm (COPY.withdraw.modal.confirmButton*).
const MODAL_CONFIRM_TESTID = '[data-testid="withdraw-modal-confirm-button"]';
// The Review screen's "Confirm" submit + its blocking HF warning + the reason shown when confirm is off.
const REVIEW_CONFIRM_TESTID = '[data-testid="withdraw-confirm-button"]';
const HF_BLOCK_TESTID = '[data-testid="withdraw-hf-block-warning"]';
const DISABLED_REASON_TESTID = '[data-testid="withdraw-disabled-reason"]';
// Success screen: "Withdrawal initiated" (COPY.withdraw.initiated.title) + its Done button. Both are
// unique to the withdraw progress view (not the shared LoanSuccessModal), so either safely marks success.
const WITHDRAW_DONE_TESTID = '[data-testid="withdraw-done-button"]';
const WITHDRAW_INITIATED_RX = /withdrawal initiated/i;

/** Short form of a bytes32 vaultId for logs (e.g. `0x1234abcd…`). */
function shortenVaultId(id: string): string {
  return id.length > 12 ? `${id.slice(0, 10)}…` : id;
}

/**
 * Open the withdraw flow from the dashboard: click the Collateral "⋯" menu, then its "Withdraw" item,
 * and wait for the selection modal. The "⋯" trigger is only rendered when the position holds collateral,
 * so we poll for it to appear AND enable within one window (not a short visibility wait before a long
 * enable wait, which would abort early on a slow-to-render menu).
 */
async function openWithdraw(
  page: Page,
  log: (m: string) => void,
): Promise<void> {
  const trigger = firstByTestid(
    page,
    COLLATERAL_ACTIONS_TESTID,
    page.getByRole("button", { name: COLLATERAL_ACTIONS_RX }),
  );
  const deadline = Date.now() + WITHDRAW_MENU_TIMEOUT_MS;
  let ready = false;
  while (!ready && Date.now() < deadline) {
    if (await trigger.isVisible().catch(() => false))
      ready = await trigger.isEnabled().catch(() => false);
    if (!ready) await page.waitForTimeout(FORM_SETTLE_MS);
  }
  if (!ready)
    throw new Error(
      `The Collateral "⋯" actions menu stayed absent/disabled for ${Math.round(WITHDRAW_MENU_TIMEOUT_MS / MS_PER_SECOND)}s — this position has no active collateral to withdraw.`,
    );
  log('Opening the withdraw flow (Collateral → "⋯" → Withdraw)');
  await trigger.click();

  const menuItem = firstByTestid(
    page,
    WITHDRAW_MENU_TESTID,
    page.getByRole("menuitem", { name: WITHDRAW_MENU_RX }),
  );
  await menuItem.waitFor({ state: "visible", timeout: STEP_TIMEOUT_MS });
  if (!(await menuItem.isEnabled().catch(() => false)))
    throw new Error(
      "The Withdraw menu item is disabled — withdrawals are paused by the protocol right now.",
    );
  await menuItem.click();

  const confirm = page.locator(MODAL_CONFIRM_TESTID).first();
  const appeared = await confirm
    .waitFor({ state: "visible", timeout: WITHDRAW_MODAL_TIMEOUT_MS })
    .then(() => true)
    .catch(() => false);
  if (!appeared)
    throw new Error(
      `The withdraw selection modal did not open within ${Math.round(WITHDRAW_MODAL_TIMEOUT_MS / MS_PER_SECOND)}s after clicking Withdraw.`,
    );
  log("Withdraw selection modal opened");
}

/** Index of the first row with an enabled (selectable) checkbox, or -1 if none. */
async function findSelectableRow(
  rows: ReturnType<Page["locator"]>,
  count: number,
): Promise<number> {
  for (let i = 0; i < count; i++) {
    if (
      await rows
        .nth(i)
        .locator(VAULT_CHECKBOX_SELECTOR)
        .isEnabled()
        .catch(() => false)
    )
      return i;
  }
  return -1;
}

/**
 * Tick the vault checkbox(es) in the selection modal. A row's checkbox is `disabled` unless the vault is
 * selectable (in use AND withdrawable without breaching HF) — the same eligibility the modal enforces —
 * so we skip disabled rows. Default selects the FIRST selectable vault (keeps the position alive);
 * `all` ticks every selectable one. Returns the selected `vaultId`s (read from the row testids). THROWS
 * when nothing is selectable (all HF-gated or none in use).
 *
 * Polls for a selectable row first: after a chained `--repay-first` the app's position/HF read can lag
 * the on-chain debt clear by a poll cycle, briefly leaving every vault HF-gated — so we wait for one to
 * become selectable rather than mistaking that transient for "nothing withdrawable".
 */
async function selectVaults(
  page: Page,
  log: (m: string) => void,
  all: boolean,
): Promise<string[]> {
  const rows = page.locator(VAULT_ROW_SELECTOR);
  const deadline = Date.now() + WITHDRAW_CTA_ENABLE_TIMEOUT_MS;
  let count = 0;
  let firstSelectable = -1;
  while (Date.now() < deadline) {
    count = await rows.count();
    if (count > 0) {
      firstSelectable = await findSelectableRow(rows, count);
      if (firstSelectable >= 0) break;
    }
    await page.waitForTimeout(FORM_SETTLE_MS);
  }
  if (count === 0)
    throw new Error(
      "The withdraw modal showed no vault rows — this position has nothing to withdraw.",
    );
  if (firstSelectable < 0)
    throw new Error(
      `No withdrawable vault in the modal after ${Math.round(WITHDRAW_CTA_ENABLE_TIMEOUT_MS / MS_PER_SECOND)}s (${count} shown — all are health-factor-gated or not in use). Repay outstanding debt first so collateral can be released.`,
    );

  const selectedIds: string[] = [];
  for (let i = firstSelectable; i < count; i++) {
    const row = rows.nth(i);
    const checkbox = row.locator(VAULT_CHECKBOX_SELECTOR);
    if (!(await checkbox.isEnabled().catch(() => false))) continue; // not selectable
    // The input is visually replaced by an SVG (zero-size), so bypass actionability with force; check()
    // is idempotent (ensures the box ends up ticked).
    await checkbox.check({ force: true });
    const testid = await row.getAttribute("data-testid").catch(() => null);
    if (testid?.startsWith(VAULT_ROW_TESTID_PREFIX))
      selectedIds.push(testid.slice(VAULT_ROW_TESTID_PREFIX.length));
    if (!all) break;
  }

  log(
    `Selected ${selectedIds.length} vault(s) to withdraw: ${selectedIds.map(shortenVaultId).join(", ")}`,
  );
  return selectedIds;
}

/**
 * Click the selection modal's "Withdraw {amount}" confirm once it enables (a selection is made and the
 * projected HF holds). On timeout, surface the modal's own disabled reason so a blocked run explains why.
 */
async function confirmSelection(
  page: Page,
  log: (m: string) => void,
): Promise<void> {
  const confirm = page.locator(MODAL_CONFIRM_TESTID).first();
  const deadline = Date.now() + WITHDRAW_CTA_ENABLE_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (await confirm.isEnabled().catch(() => false)) {
      log("Confirming the vault selection");
      await confirm.click();
      return;
    }
    await page.waitForTimeout(FORM_SETTLE_MS);
  }
  const reason = (
    await page
      .locator(DISABLED_REASON_TESTID)
      .first()
      .innerText()
      .catch(() => "")
  )
    .replace(/\s+/g, " ")
    .trim();
  throw new Error(
    `The withdraw modal's confirm button stayed disabled for ${Math.round(WITHDRAW_CTA_ENABLE_TIMEOUT_MS / MS_PER_SECOND)}s${reason ? ` — ${reason}` : ""}.`,
  );
}

/**
 * On the Review screen, wait for the "Confirm" submit to enable and click it. Fails fast if the blocking
 * HF warning is present (the withdrawal would drop the health factor below the on-chain minimum) — that
 * won't self-resolve by waiting.
 */
async function submitReview(
  page: Page,
  log: (m: string) => void,
): Promise<void> {
  const confirm = page.locator(REVIEW_CONFIRM_TESTID).first();
  const hfBlock = page.locator(HF_BLOCK_TESTID).first();
  const appeared = await confirm
    .waitFor({ state: "visible", timeout: STEP_TIMEOUT_MS })
    .then(() => true)
    .catch(() => false);
  if (!appeared)
    throw new Error(
      `The withdraw review screen did not appear within ${Math.round(STEP_TIMEOUT_MS / MS_PER_SECOND)}s after confirming the selection.`,
    );

  const deadline = Date.now() + WITHDRAW_CTA_ENABLE_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (await hfBlock.isVisible().catch(() => false))
      throw new Error(
        "Withdraw blocked on the review screen: this withdrawal would drop the health factor below the on-chain minimum. Repay debt or withdraw fewer vaults.",
      );
    if (await confirm.isEnabled().catch(() => false)) {
      log(
        "Review confirmed — submitting the withdraw transaction (the approver will confirm the MetaMask tx)",
      );
      await confirm.click();
      return;
    }
    await page.waitForTimeout(FORM_SETTLE_MS);
  }
  throw new Error(
    `The withdraw review's Confirm button stayed disabled for ${Math.round(WITHDRAW_CTA_ENABLE_TIMEOUT_MS / MS_PER_SECOND)}s.`,
  );
}

/**
 * After submitting, actively approve the single MetaMask withdraw pop-up (the approver's sweep confirms
 * whatever appears), then wait for the "Withdrawal initiated" screen and click Done. Fails fast if the
 * form surfaces a "Transaction failed" callout. Success is keyed ONLY on withdraw-specific markers (the
 * "Withdrawal initiated" title or the `withdraw-done-button` testid); the generic Done role is only the
 * click target after success is confirmed.
 */
async function confirmWithdrawSuccess(
  page: Page,
  context: BrowserContext,
  log: (m: string) => void,
): Promise<void> {
  const initiated = page.getByText(WITHDRAW_INITIATED_RX).first();
  const doneVisible = page.locator(WITHDRAW_DONE_TESTID).first();
  const done = firstByTestid(
    page,
    WITHDRAW_DONE_TESTID,
    page.getByRole("button", { name: DONE_BUTTON_RX }),
  );
  const txFailed = page.getByText(TX_FAILED_RX).first();
  const deadline = Date.now() + WITHDRAW_TX_TIMEOUT_MS;
  while (Date.now() < deadline) {
    await sweepApprovals(context, page, log);

    if (
      (await initiated.isVisible().catch(() => false)) ||
      (await doneVisible.isVisible().catch(() => false))
    ) {
      log("✅ Withdrawal initiated — clicking Done");
      await done.click({ timeout: STEP_TIMEOUT_MS }).catch(() => {});
      return;
    }
    if (await txFailed.isVisible().catch(() => false))
      throw new Error(
        "Withdraw transaction failed. See trace.zip + the failure screenshot.",
      );
    await page.waitForTimeout(FORM_SETTLE_MS);
  }
  throw new Error(
    `Withdraw did not reach the "Withdrawal initiated" screen within ${Math.round(WITHDRAW_TX_TIMEOUT_MS / MS_PER_SECOND)}s — the MetaMask withdraw transaction may not have confirmed. See trace.zip + the failure screenshot.`,
  );
}

/**
 * After the success screen, verify on-chain that the position's collateral actually fell — the UI
 * "Withdrawal initiated" alone doesn't prove the vault left the position. Polls `fetchCollateralSats`
 * (on-chain `getPosition.totalCollateralBTC`) until it drops below the pre-withdraw baseline (inverse of
 * borrow's collateral-rose wait). Never silently passes; throws if collateral doesn't move.
 */
async function assertCollateralDecreased(
  ctx: ActionContext,
  beforeSats: bigint,
): Promise<void> {
  const deadline = Date.now() + WITHDRAW_TX_TIMEOUT_MS;
  let lastSats = beforeSats;
  while (Date.now() < deadline) {
    const sats = await fetchCollateralSats(
      ctx.config.network,
      ctx.eth.address,
    ).catch(() => null);
    if (sats != null) {
      lastSats = sats;
      if (sats < beforeSats) {
        ctx.log(
          `✅ On-chain collateral fell: ${formatBtc(beforeSats)} → ${formatBtc(sats)}.`,
        );
        return;
      }
    }
    await ctx.page.waitForTimeout(WITHDRAW_VERIFY_POLL_MS);
  }
  throw new Error(
    `Withdraw reached the success screen but on-chain collateral did not fall within ${Math.round(WITHDRAW_TX_TIMEOUT_MS / MS_PER_SECOND)}s (before ${formatBtc(beforeSats)}, last ${formatBtc(lastSats)}) — the position doesn't reflect the withdrawal.`,
  );
}

/** Drive the withdraw flow proper (assumes wallets connected + approver/recorder installed by the caller). */
export async function runWithdrawFlow(
  ctx: ActionContext,
  onStep: (step: string) => void,
): Promise<void> {
  const { page, context, log } = ctx;

  onStep("withdraw-open");
  await openWithdraw(page, log);

  onStep("withdraw-select");
  const selectedIds = await selectVaults(
    page,
    log,
    ctx.config.withdrawAll === true,
  );

  // Snapshot on-chain collateral BEFORE submitting so we can assert it fell afterwards (a real-data
  // post-condition on top of the UI success screen).
  const collateralBeforeSats = await fetchCollateralSats(
    ctx.config.network,
    ctx.eth.address,
  ).catch(() => null);

  onStep("withdraw-modal-confirm");
  await confirmSelection(page, log);

  onStep("withdraw-review");
  await submitReview(page, log);

  await confirmWithdrawSuccess(page, context, log);

  onStep("withdraw-verify");
  if (collateralBeforeSats == null)
    log(
      "⚠️ Skipping the on-chain collateral check — couldn't read the pre-withdraw collateral to compare against.",
    );
  else await assertCollateralDecreased(ctx, collateralBeforeSats);

  log(`Withdraw released ${selectedIds.length} vault(s).`);
}

export const withdrawAction: Action = {
  id: "withdraw",
  async run(ctx: ActionContext): Promise<void> {
    const { page, context, log, artifactsDir } = ctx;

    const handler = installPopupApprover(context, log);
    let currentStep = "connect";
    const recorder = await startRecording(
      context,
      page,
      artifactsDir,
      log,
      () => currentStep,
    );
    try {
      await connectWallets(ctx);

      if (ctx.config.borrowFirst) {
        log(
          "Withdraw --borrow-first: borrowing before repay + withdraw" +
            (ctx.config.peginFirst
              ? " (pegging in fresh collateral first)"
              : ""),
        );
        // The borrow (+ optional pegin) leg is a hard prerequisite: if it fails there is no new loan /
        // collateral to unwind, so STOP — never fall through to repay + withdraw. runBorrowWithOptionalPegin
        // throws on any pegin/borrow failure; we catch only to log the skip intent, then rethrow.
        try {
          await runBorrowWithOptionalPegin(ctx, (step) => {
            currentStep = `borrow:${step}`;
          });
        } catch (error) {
          log(
            "❌ Borrow leg failed — stopping the run and SKIPPING repay + withdraw (no new loan/collateral to unwind).",
          );
          throw error;
        }
      }

      if (ctx.config.repayFirst) {
        log(
          "Withdraw --repay-first: repaying the outstanding debt in full before withdrawing",
        );
        // The repay leg is a hard prerequisite: if it fails, the debt isn't cleared and the collateral
        // stays health-factor-gated, so STOP here — never fall through to the withdraw. runRepayFlow
        // throws on any repay failure; we catch only to log the skip intent, then rethrow.
        try {
          await runRepayFlow(ctx, (step) => {
            currentStep = `repay:${step}`;
          });
        } catch (error) {
          log(
            "❌ Repay leg failed — stopping the run and SKIPPING withdraw (debt not cleared; collateral would be health-factor-gated).",
          );
          throw error;
        }
      }

      await runWithdrawFlow(ctx, (step) => {
        currentStep = step;
      });
      log("✅ Withdraw complete.");
    } finally {
      await recorder.stop();
      context.off("page", handler);
    }
  },
};
