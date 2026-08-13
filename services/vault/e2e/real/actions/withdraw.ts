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
 *     carries debt, some/all vaults may be HF-gated; the Review screen's HF gate enforces that, and we
 *     surface it rather than guessing.
 *   - REPAY-FIRST (`--repay-first`): repay the outstanding debt in full (the shared `runRepayFlow` with
 *     the amount forced to Max), then withdraw — clearing the HF gate so collateral releases cleanly.
 *   - BORROW-FIRST (`--borrow-first`): borrow (the shared `runBorrowWithOptionalPegin`), then repay that
 *     loan in full, then withdraw — all in one session.
 *   - PEGIN-FIRST (`--pegin-first`): peg in fresh collateral (optionally `--split` for two vaults) ahead
 *     of the borrow, giving the full pegin → borrow → repay → withdraw lifecycle. The CLI's flag cascade
 *     (`--pegin-first ⟹ --borrow-first ⟹ --repay-first`) sets these, so this action just runs whichever
 *     legs are enabled in order.
 *
 * Click path (v3 — the "⋯" menu and the vault-selection modal are gone; see
 * markdown/e2e-v3/05-withdraw.md):
 *   /vaults → a row's "Withdraw" → Review ("Confirm") → one MetaMask tx → "Withdrawal initiated" →
 *   "Done".
 *
 * The row's Withdraw button IS the eligibility gate: the app disables it for a paused protocol, a vault
 * that is not in use, a demo (`displayOnly`) row and an optimistic (`isActivating`) one — see
 * VaultsActiveSection. Health-factor gating surfaces one step later, on the Review screen.
 *
 * Default withdraws ONE vault (the first withdrawable), keeping the position alive for reuse.
 * `--withdraw-all` repeats the whole row → Review → Done cycle per withdrawable vault: v3 opens the
 * flow with exactly one preselected vault, so releasing several means several transactions, not one
 * multi-select. No SDK / product logic is reimplemented — the row's disabled state + the Review HF gate
 * are authoritative.
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
  WITHDRAW_MODAL_TIMEOUT_MS,
  WITHDRAW_TX_TIMEOUT_MS,
  WITHDRAW_VERIFY_POLL_MS,
} from "../timing";

import { installPopupApprover, sweepApprovals } from "./approver";
import { runBorrowWithOptionalPegin } from "./borrow";
import { goToSection } from "./navigation";
import { startRecording } from "./recording";
import { runRepayFlow } from "./repay";
import { DONE_BUTTON_RX, firstByTestid, TX_FAILED_RX } from "./selectors";
import { type Action, type ActionContext } from "./types";
import { connectWallets } from "./walletConnect";

// ── Withdraw selectors ────────────────────────────────────────────────────────
// One active-vault row on /vaults, keyed by on-chain vaultId (VaultsActiveSection ActiveVaultRow), and
// the per-row "Withdraw" button inside it. The button's `disabled` state is the app's own eligibility
// gate, which is exactly how we tell a withdrawable vault apart.
const VAULT_ROW_TESTID_PREFIX = "vault-row-";
const VAULT_ROW_SELECTOR = `[data-testid^="${VAULT_ROW_TESTID_PREFIX}"]`;
const ROW_WITHDRAW_TESTID = '[data-testid="vault-withdraw-button"]';
// The Review screen's "Confirm" submit + its blocking HF warning.
const REVIEW_CONFIRM_TESTID = '[data-testid="withdraw-confirm-button"]';
const HF_BLOCK_TESTID = '[data-testid="withdraw-hf-block-warning"]';
// Success screen: "Withdrawal initiated" (COPY.withdraw.initiated.title) + its Done button. Both are
// unique to the withdraw progress view (not the shared LoanSuccessModal), so either safely marks success.
const WITHDRAW_DONE_TESTID = '[data-testid="withdraw-done-button"]';
const WITHDRAW_INITIATED_RX = /withdrawal initiated/i;

/** vaultId log form: keep the first N chars (0x + 8 hex), then elide the rest with "…". */
const VAULT_ID_LOG_PREFIX_LEN = 10;
/** Only shorten a vaultId longer than this — a short/blank id logs whole. */
const VAULT_ID_LOG_MIN_LEN = 12;

/** Short form of a bytes32 vaultId for logs (e.g. `0x1234abcd…`). */
function shortenVaultId(id: string): string {
  return id.length > VAULT_ID_LOG_MIN_LEN
    ? `${id.slice(0, VAULT_ID_LOG_PREFIX_LEN)}…`
    : id;
}

/**
 * The `vaultId` of the first row whose Withdraw button is enabled and whose vault hasn't been released
 * yet in this run, or `undefined` when there is none. Reads the id off the row's testid so the caller
 * can log and de-duplicate by vault rather than by list position (rows shift as vaults leave the list).
 */
async function findWithdrawableVaultId(
  page: Page,
  released: ReadonlySet<string>,
): Promise<{ vaultId: string; rowCount: number } | { rowCount: number }> {
  const rows = page.locator(VAULT_ROW_SELECTOR);
  const rowCount = await rows.count().catch(() => 0);
  for (let i = 0; i < rowCount; i++) {
    const row = rows.nth(i);
    const testid = await row.getAttribute("data-testid").catch(() => null);
    if (!testid?.startsWith(VAULT_ROW_TESTID_PREFIX)) continue;
    const vaultId = testid.slice(VAULT_ROW_TESTID_PREFIX.length);
    if (released.has(vaultId)) continue;
    const enabled = await row
      .locator(ROW_WITHDRAW_TESTID)
      .first()
      .isEnabled()
      .catch(() => false);
    if (enabled) return { vaultId, rowCount };
  }
  return { rowCount };
}

/**
 * Open the withdraw flow for one vault: on /vaults, click the first withdrawable row's "Withdraw", which
 * opens the flow with THAT vault preselected, and wait for the Review screen. Returns the released
 * `vaultId`.
 *
 * Polls for a withdrawable row rather than checking once: after a chained `--repay-first` the app's
 * position/HF read can lag the on-chain debt clear by a poll cycle, briefly leaving every row's button
 * disabled — waiting that out is not the same as "nothing withdrawable". `released` holds the vaults
 * this run has already put through the flow, so a `--withdraw-all` pass can't re-enter one whose row
 * hasn't left the list yet.
 */
async function openWithdrawForRow(
  page: Page,
  log: (m: string) => void,
  released: ReadonlySet<string>,
): Promise<string> {
  await goToSection(page, "vaults", log);

  const deadline = Date.now() + WITHDRAW_CTA_ENABLE_TIMEOUT_MS;
  let found = await findWithdrawableVaultId(page, released);
  while (!("vaultId" in found) && Date.now() < deadline) {
    await page.waitForTimeout(FORM_SETTLE_MS);
    found = await findWithdrawableVaultId(page, released);
  }
  if (!("vaultId" in found)) {
    if (found.rowCount === 0)
      throw new Error(
        "No active vault rows on /vaults — this position has nothing to withdraw.",
      );
    throw new Error(
      `No withdrawable vault on /vaults after ${Math.round(WITHDRAW_CTA_ENABLE_TIMEOUT_MS / MS_PER_SECOND)}s (${found.rowCount} row(s) shown — every Withdraw button is disabled: the vault is not in use, still activating, or withdrawals are paused by the protocol). Repay outstanding debt first so collateral can be released.`,
    );
  }

  const { vaultId } = found;
  log(`Opening the withdraw flow for vault ${shortenVaultId(vaultId)}`);
  await page
    .locator(`[data-testid="${VAULT_ROW_TESTID_PREFIX}${vaultId}"]`)
    .locator(ROW_WITHDRAW_TESTID)
    .first()
    .click({ timeout: STEP_TIMEOUT_MS });

  const confirm = page.locator(REVIEW_CONFIRM_TESTID).first();
  const appeared = await confirm
    .waitFor({ state: "visible", timeout: WITHDRAW_MODAL_TIMEOUT_MS })
    .then(() => true)
    .catch(() => false);
  if (!appeared)
    throw new Error(
      `The withdraw review screen did not open within ${Math.round(WITHDRAW_MODAL_TIMEOUT_MS / MS_PER_SECOND)}s after clicking the row's Withdraw.`,
    );
  return vaultId;
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

/**
 * Drive the withdraw flow proper (assumes wallets connected + approver/recorder installed by the
 * caller). One pass per released vault: v3's flow opens with a single preselected vault, so
 * `--withdraw-all` repeats row → Review → Done — one on-chain transaction each — until no withdrawable
 * row is left. The default releases exactly one, keeping the position alive for reuse.
 *
 * The on-chain collateral snapshot is taken before the FIRST pass and asserted after the LAST, so the
 * post-condition covers the whole batch rather than re-reading between transactions.
 */
export async function runWithdrawFlow(
  ctx: ActionContext,
  onStep: (step: string) => void,
): Promise<void> {
  const { page, context, log } = ctx;
  const all = ctx.config.withdrawAll === true;

  // Snapshot on-chain collateral BEFORE submitting so we can assert it fell afterwards (a real-data
  // post-condition on top of the UI success screen).
  const collateralBeforeSats = await fetchCollateralSats(
    ctx.config.network,
    ctx.eth.address,
  ).catch(() => null);

  const released = new Set<string>();
  for (;;) {
    const pass = released.size + 1;
    onStep(`withdraw-open${all ? `:${pass}` : ""}`);
    const vaultId = await openWithdrawForRow(page, log, released);

    onStep(`withdraw-review${all ? `:${pass}` : ""}`);
    await submitReview(page, log);

    await confirmWithdrawSuccess(page, context, log);
    released.add(vaultId);
    log(
      `Released vault ${shortenVaultId(vaultId)} (${released.size} this run).`,
    );
    if (!all) break;

    // The success screen MUST be gone before the next pass looks at the rows. The withdraw flow is an
    // overlay and never changes the URL, so `goToSection` below is a no-op here and synchronises
    // nothing; /vaults stays mounted underneath it. Scanning too early reads those covered rows — and a
    // covered button still reports `isEnabled()`, so the scan would hand back a vaultId whose click then
    // hangs to timeout on a pointer intercept, far from the real cause. `confirmWithdrawSuccess`
    // deliberately tolerates a failed Done click (success is already proven by the initiated screen, so
    // a missed click must not fail an otherwise-good withdrawal), which is exactly how the overlay can
    // still be up at this point — so wait it out here and fail with the real reason if it never closes.
    const overlayClosed = await page
      .locator(WITHDRAW_DONE_TESTID)
      .first()
      .waitFor({ state: "hidden", timeout: STEP_TIMEOUT_MS })
      .then(() => true)
      .catch(() => false);
    if (!overlayClosed)
      throw new Error(
        `The withdraw success screen stayed open for ${Math.round(STEP_TIMEOUT_MS / MS_PER_SECOND)}s after releasing vault ${shortenVaultId(vaultId)} — its Done button did not dismiss it, so the remaining vaults can't be reached. ${released.size} vault(s) were released; re-run to continue.`,
      );

    // Another pass only if a withdrawable row remains. The just-released vault leaves the active list,
    // so this settles at "nothing left to release" rather than needing a count decided up front.
    await goToSection(page, "vaults", log);
    const next = await findWithdrawableVaultId(page, released);
    if (!("vaultId" in next)) break;
  }

  onStep("withdraw-verify");
  if (collateralBeforeSats == null)
    log(
      "⚠️ Skipping the on-chain collateral check — couldn't read the pre-withdraw collateral to compare against.",
    );
  else await assertCollateralDecreased(ctx, collateralBeforeSats);

  log(`Withdraw released ${released.size} vault(s).`);
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
