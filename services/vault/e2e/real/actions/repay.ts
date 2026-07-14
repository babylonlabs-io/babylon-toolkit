/**
 * The "repay" action: pay down (or clear) a loan drawn against a BTC-Vault position, end-to-end on real
 * Sepolia. Two shapes, selected by the CLI:
 *   - REUSE (default): repay a loan the depositor already holds. run.ts refuses the run before the
 *     browser if there's no debt, so we land on the dashboard with the Repay button ready.
 *   - BORROW-FIRST (`--borrow-first`): borrow first (the shared `runBorrowWithOptionalPegin`), then
 *     repay that loan — all in one browser session. Adding `--pegin-first` pegs in fresh collateral
 *     ahead of the borrow, giving the full pegin → borrow → repay lifecycle in one run.
 *
 * The repay flow is short but has two shapes the CLI must handle that borrow doesn't:
 *   - A depositor with exactly ONE loan is routed straight to the repay form; only MULTIPLE loans open
 *     the "Select asset" picker. So after clicking Repay we wait for EITHER the picker OR the form.
 *   - Repaying can take ONE or TWO MetaMask transactions: an ERC-20 approve of the debt token to the
 *     adapter (only when the current allowance is insufficient), then the repay. The CTA reads
 *     "Processing…" across both; the pop-up approver confirms whatever appears.
 *
 * Selectors are testid-first (added to the src repay controls, mirroring borrow) with tolerant
 * text/role/class fallbacks. No SDK / product logic is reimplemented — the amount is a best-effort
 * default and the live form is the authoritative gate (its Max button + validation).
 *
 * NEVER run without an explicit go-ahead: it moves real value (a debt repayment, plus real ERC-20
 * approval + repay gas).
 */
import type { BrowserContext, Locator, Page } from "@playwright/test";

import { fetchBorrowContext } from "../borrowParams";
import { type NetworkName } from "../config";
import {
  CONSERVATIVE_REPAY_FRACTION,
  fetchRepayableDebts,
  type RepayableDebt,
} from "../repayParams";
import {
  FORM_SETTLE_MS,
  MS_PER_SECOND,
  REPAY_BUTTON_ENABLE_TIMEOUT_MS,
  REPAY_CTA_ENABLE_TIMEOUT_MS,
  REPAY_TX_TIMEOUT_MS,
  REPAY_VERIFY_POLL_MS,
  STEP_TIMEOUT_MS,
} from "../timing";
import { formatTokenAmount } from "../tokenAmount";

import { installPopupApprover, sweepApprovals } from "./approver";
import { runBorrowWithOptionalPegin } from "./borrow";
import { startRecording } from "./recording";
import {
  AMOUNT_INPUT,
  ASSET_SELECT_TITLE,
  DONE_BUTTON_RX,
  firstByTestid,
  FLUID_CTA_SELECTOR,
  MAX_AMOUNT_KEYWORD,
  MAX_BUTTON_RX,
  SUCCESS_DONE_TESTID,
  TX_FAILED_RX,
} from "./selectors";
import { type Action, type ActionContext } from "./types";
import { connectWallets } from "./walletConnect";

// Dashboard "Loans" section → Repay (testid-first; the fallback matches the button only while it reads
// exactly "Repay", which is fine on the dashboard where the CTA isn't relabeled). The shared loan-form
// selectors (amount input — also used to detect a single-loan repay skipping the picker — Max button,
// "Select asset" title, success-modal Done, tx-failed) live in selectors.ts; repay-specific ones here.
const LOANS_REPAY_TESTID = '[data-testid="loans-repay-button"]';
const REPAY_BUTTON_RX = /^repay$/i; // COPY.loans.repayButton
const REPAY_SUBMIT_TESTID = '[data-testid="repay-submit-button"]';
const REPAY_SUBMIT_ENABLED_LABEL = "Repay"; // COPY.loans.repay.action (enabled state)
// Submit labels that won't resolve by waiting — fail fast with the callout (COPY.loans.repay.*).
// "Repaying Unavailable" is protocol-gated; the rest are fixed properties of the entered amount vs the
// wallet balance / debt, none of which change while we wait (repay has no collateral-propagation
// transient like borrow does).
const REPAY_INSTANT_FAIL_LABELS = new Set([
  "Repaying Unavailable",
  "Amount too small",
  "Amount exceeds debt",
  "Insufficient balance",
]);
// Best-effort: the repay validation/availability callout body phrases (COPY.loans.repay.*), surfaced in
// the fail-fast message so a blocked run says why.
const CALLOUT_BODY_RX =
  /(cannot repay more|Minimum repayable|balance is 0|less than your debt|need more|temporarily unavailable|Couldn't (load|refresh))[^.]*\.?/i;
// Success screen: the repay-specific title (the shared Done testid/text + tx-failed live in selectors).
const REPAY_SUCCESS_RX = /repay successful/i; // COPY.loans.repaySuccess.title
/**
 * Minimum on-chain debt FALL (USD) that counts as "the repay landed", checked after the success screen.
 * Small — even the 25% default clears far more — but above float/oracle-tick noise on the debt value.
 */
const DEBT_DECREASE_MIN_USD = 0.01;

/** The resolved repay amount: click the form's Max button, or fill a specific token amount. */
type RepayAmount = { mode: "max" } | { mode: "amount"; value: string };

/**
 * Resolve the amount to repay. An explicit `--repay-amount` wins (a number, or `max`). Otherwise it
 * computes a conservative fraction of the outstanding debt, capped at the wallet's balance of the debt
 * token so the default is always affordable. If that can't produce a positive amount (read failed, no
 * debt for the token, zero balance, or the fraction rounds to 0 at the token's precision) it THROWS
 * rather than silently clicking Max — a full clear is only ever done when explicitly requested via
 * `--repay-amount=max`.
 */
async function resolveRepayAmount(
  ctx: ActionContext,
  token: string | undefined,
): Promise<RepayAmount> {
  const raw = ctx.config.repayAmount?.trim();
  if (raw && raw.toLowerCase() === MAX_AMOUNT_KEYWORD) return { mode: "max" };
  if (raw) return { mode: "amount", value: raw };

  if (!token)
    throw new Error(
      "repay: no --repay-token resolved and no --repay-amount given — cannot compute a safe default. Re-run with --repay-token and/or --repay-amount.",
    );

  let debt: RepayableDebt | undefined;
  try {
    const debts = await fetchRepayableDebts(
      ctx.config.network,
      ctx.eth.address,
    );
    debt = debts.find((d) => d.symbol.toLowerCase() === token.toLowerCase());
  } catch (error) {
    throw new Error(
      `repay: could not read the outstanding ${token} debt (${error instanceof Error ? error.message : error}) — refusing to guess an amount. Re-run with an explicit --repay-amount (or --repay-amount=max).`,
    );
  }
  if (!debt)
    throw new Error(
      `repay: this position has no outstanding ${token} debt to repay. Re-run with a token you owe on, or --repay-amount.`,
    );
  if (debt.balanceTokens <= 0)
    throw new Error(
      `repay: your wallet holds 0 ${token} — you need ${token} to repay this debt (${debt.debtTokens} ${token} outstanding). Acquire some first.`,
    );

  // Cap the conservative fraction at the wallet balance so the default never trips "Insufficient
  // balance"; format (floored) to the token's precision.
  const target = Math.min(
    debt.debtTokens * CONSERVATIVE_REPAY_FRACTION,
    debt.balanceTokens,
  );
  const value = formatTokenAmount(target, debt.decimals);
  if (Number(value) <= 0)
    throw new Error(
      `repay: the conservative default for ${token} rounds to 0 (outstanding debt ${debt.debtTokens} ${token}, wallet balance ${debt.balanceTokens} ${token}). Re-run with an explicit --repay-amount.`,
    );
  ctx.log(
    `Repay amount: ${value} ${debt.symbol} (~${Math.round(CONSERVATIVE_REPAY_FRACTION * 100)}% of ${debt.debtTokens} ${debt.symbol} debt; wallet holds ${debt.balanceTokens} ${debt.symbol}).`,
  );
  return { mode: "amount", value };
}

/**
 * Open the repay flow from the dashboard: click Loans → Repay, then wait for EITHER the "Select asset"
 * picker (multiple loans) OR the repay form itself (a single loan skips the picker — see the app's
 * DashboardPage.handleRepay). Returns whether the picker appeared, so the caller knows to select an
 * asset. The Repay button only renders when the position has a loan and is enabled once connected; a
 * loan created earlier in the same session (borrow-first) takes a moment to propagate, so we poll for it
 * to enable rather than failing on the first check.
 */
async function openRepay(
  page: Page,
  log: (m: string) => void,
): Promise<{ pickerOpened: boolean }> {
  const repay = firstByTestid(
    page,
    LOANS_REPAY_TESTID,
    page.getByRole("button", { name: REPAY_BUTTON_RX }),
  );
  await repay.waitFor({ state: "visible", timeout: STEP_TIMEOUT_MS });
  const deadline = Date.now() + REPAY_BUTTON_ENABLE_TIMEOUT_MS;
  let enabled = await repay.isEnabled().catch(() => false);
  while (!enabled && Date.now() < deadline) {
    await page.waitForTimeout(FORM_SETTLE_MS);
    enabled = await repay.isEnabled().catch(() => false);
  }
  if (!enabled)
    throw new Error(
      `The dashboard Repay button stayed disabled/absent for ${Math.round(REPAY_BUTTON_ENABLE_TIMEOUT_MS / MS_PER_SECOND)}s — this position has no loan to repay.`,
    );
  log("Opening the repay flow (Loans → Repay)");
  await repay.click();

  // Race the two possible landings. The picker is identified by its "Select asset" title; the repay form
  // by its numeric amount input (present on the form, absent on the dashboard) — a more specific signal
  // than the generic fluid CTA, so a stray dashboard fluid button can't be mistaken for the form.
  const pickerTitle = page
    .getByText(ASSET_SELECT_TITLE, { exact: true })
    .first();
  const amountInput = page.locator(AMOUNT_INPUT).first();
  const landDeadline = Date.now() + STEP_TIMEOUT_MS;
  while (Date.now() < landDeadline) {
    if (await pickerTitle.isVisible().catch(() => false)) {
      log("Asset picker opened (multiple loans) — selecting the debt token");
      return { pickerOpened: true };
    }
    if (await amountInput.isVisible().catch(() => false)) {
      log("Routed straight to the repay form (single loan)");
      return { pickerOpened: false };
    }
    await page.waitForTimeout(FORM_SETTLE_MS);
  }
  throw new Error(
    `Repay: after clicking Repay, neither the asset picker nor the repay form appeared within ${Math.round(STEP_TIMEOUT_MS / MS_PER_SECOND)}s.`,
  );
}

/**
 * Pick the debt token in the "Select asset" picker (repay mode). Prefer the per-symbol testid; fall back
 * to the row whose text contains the symbol. With no token specified, take the first row. Waits for the
 * row (the picker's rows are the user's loans, available immediately). Returns the symbol used.
 */
async function selectAsset(
  page: Page,
  log: (m: string) => void,
  token: string | undefined,
): Promise<string | undefined> {
  const row = token
    ? firstByTestid(
        page,
        `[data-testid="asset-select-row-${token.toLowerCase()}"]`,
        page.getByRole("button").filter({ hasText: new RegExp(token, "i") }),
      )
    : page.locator('[data-testid^="asset-select-row-"]').first();
  const appeared = await row
    .waitFor({ state: "visible", timeout: STEP_TIMEOUT_MS })
    .then(() => true)
    .catch(() => false);
  if (!appeared)
    throw new Error(
      token
        ? `Repay token "${token}" was not found in the asset picker within ${Math.round(STEP_TIMEOUT_MS / MS_PER_SECOND)}s.`
        : "No repay token specified and no loan rows were found in the picker.",
    );
  const label = (await row.innerText().catch(() => ""))
    .replace(/\s+/g, " ")
    .trim();
  await row.click();
  log(`Selected repay token: ${token ?? label}`);
  return token ?? label;
}

/** Enter the repay amount: click the form's Max button, or fill the numeric input. */
async function fillRepayAmount(
  page: Page,
  log: (m: string) => void,
  amount: RepayAmount,
): Promise<void> {
  if (amount.mode === "max") {
    log("Repay amount: Max (clicking the form's Max button)");
    const max = page.getByRole("button", { name: MAX_BUTTON_RX }).first();
    await max.waitFor({ state: "visible", timeout: STEP_TIMEOUT_MS });
    await max.click();
  } else {
    log(`Entering repay amount: ${amount.value}`);
    const input = page.locator(AMOUNT_INPUT).first();
    await input.waitFor({ state: "visible", timeout: STEP_TIMEOUT_MS });
    await input.fill(amount.value);
  }
  await page.waitForTimeout(FORM_SETTLE_MS);
}

/** Best-effort: read the repay validation/availability callout body so a blocked run explains why. */
async function readCalloutText(page: Page): Promise<string> {
  const callout = page.getByText(CALLOUT_BODY_RX).first();
  if (!(await callout.isVisible().catch(() => false))) return "";
  return (await callout.innerText().catch(() => ""))
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Wait for the fluid submit button to become the enabled "Repay". It settles through "Enter an amount"
 * while the wallet balance + debt load; we key on the stable label-independent control (testid, else the
 * fluid-button class) and read its text each tick, logging changes. An instant-fail label (protocol
 * paused, amount too small, over debt, insufficient balance) throws immediately with the callout — none
 * of these self-resolve by waiting, unlike borrow's collateral-dependent labels.
 */
async function waitForRepayCta(
  page: Page,
  log: (m: string) => void,
): Promise<Locator> {
  const cta = firstByTestid(
    page,
    REPAY_SUBMIT_TESTID,
    page.locator(FLUID_CTA_SELECTOR),
  );
  const deadline = Date.now() + REPAY_CTA_ENABLE_TIMEOUT_MS;
  let lastLabel = "";
  while (Date.now() < deadline) {
    const label = ((await cta.textContent().catch(() => "")) ?? "").trim();
    if (label && label !== lastLabel) {
      log(`Repay CTA: "${label}"`);
      lastLabel = label;
    }
    if (REPAY_INSTANT_FAIL_LABELS.has(label)) {
      const callout = await readCalloutText(page);
      throw new Error(
        `Repay blocked at the form: "${label}"${callout ? ` — ${callout}` : ""}`,
      );
    }
    if (
      label === REPAY_SUBMIT_ENABLED_LABEL &&
      (await cta.isEnabled().catch(() => false))
    )
      return cta;
    await page.waitForTimeout(FORM_SETTLE_MS);
  }
  const callout = await readCalloutText(page);
  throw new Error(
    `Repay CTA did not become the enabled "${REPAY_SUBMIT_ENABLED_LABEL}" within ${REPAY_CTA_ENABLE_TIMEOUT_MS}ms (last label: "${lastLabel}")${callout ? ` — ${callout}` : ""}.`,
  );
}

/**
 * After submitting, actively approve the MetaMask pop-up(s) — repay can be ONE tx (repay) or TWO (an
 * ERC-20 approve of the debt token, then the repay) depending on the current allowance; the CTA reads
 * "Processing…" across both and the approver's sweep confirms whichever appear. Wait for the "Repay
 * successful" screen, then click Done. Fails fast if the form surfaces a "Transaction failed" callout.
 */
async function confirmRepaySuccess(
  page: Page,
  context: BrowserContext,
  log: (m: string) => void,
  symbol: string | undefined,
): Promise<void> {
  // Success is gated ONLY on markers specific to the loan-success screen — the "Repay successful" title
  // or the `loan-success-done-button` testid. NOT the generic "Done" role: borrow/deposit/withdraw
  // modals also have Done buttons, so keying on any Done could report a false success. The generic-role
  // done is only the click TARGET (via firstByTestid), used after success is confirmed.
  const successTitle = page.getByText(REPAY_SUCCESS_RX).first();
  const successDone = page.locator(SUCCESS_DONE_TESTID).first();
  const doneButton = firstByTestid(
    page,
    SUCCESS_DONE_TESTID,
    page.getByRole("button", { name: DONE_BUTTON_RX }),
  );
  const txFailed = page.getByText(TX_FAILED_RX).first();
  const deadline = Date.now() + REPAY_TX_TIMEOUT_MS;
  while (Date.now() < deadline) {
    await sweepApprovals(context, page, log);

    if (
      (await successTitle.isVisible().catch(() => false)) ||
      (await successDone.isVisible().catch(() => false))
    ) {
      log(`✅ Repay successful${symbol ? ` (${symbol})` : ""} — clicking Done`);
      await doneButton.click({ timeout: STEP_TIMEOUT_MS }).catch(() => {});
      return;
    }
    if (await txFailed.isVisible().catch(() => false)) {
      const detail = await readCalloutText(page);
      throw new Error(
        `Repay transaction failed${detail ? ` — ${detail}` : ""}. See trace.zip + the failure screenshot.`,
      );
    }
    await page.waitForTimeout(FORM_SETTLE_MS);
  }
  throw new Error(
    `Repay did not reach the "Repay successful" screen within ${REPAY_TX_TIMEOUT_MS}ms — a MetaMask transaction (approve and/or repay) may not have confirmed. See trace.zip + the failure screenshot.`,
  );
}

/**
 * After the success screen, verify on-chain that the position's debt actually fell — the UI "Repay
 * successful" alone doesn't prove funds moved. Polls `fetchBorrowContext` (on-chain `getUserAccountData`)
 * until the debt drops below the pre-repay baseline (inverse of borrow's debt-rose check). Skipped (with
 * a warning) only if the pre-repay baseline couldn't be read — never silently passes.
 */
async function assertRepayDebtDecreased(
  ctx: ActionContext,
  debtBeforeUsd: number | null,
): Promise<void> {
  if (debtBeforeUsd == null) {
    ctx.log(
      "⚠️ Skipping the on-chain debt check — couldn't read the pre-repay debt to compare against.",
    );
    return;
  }
  const deadline = Date.now() + REPAY_TX_TIMEOUT_MS;
  let lastUsd = debtBeforeUsd;
  while (Date.now() < deadline) {
    const context = await fetchBorrowContext(
      ctx.config.network,
      ctx.eth.address,
    ).catch(() => null);
    if (context) {
      lastUsd = context.currentDebtUsd;
      if (lastUsd < debtBeforeUsd - DEBT_DECREASE_MIN_USD) {
        ctx.log(
          `✅ On-chain debt fell: $${debtBeforeUsd.toFixed(2)} → $${lastUsd.toFixed(2)}.`,
        );
        return;
      }
    }
    await ctx.page.waitForTimeout(REPAY_VERIFY_POLL_MS);
  }
  throw new Error(
    `Repay reached the success screen but on-chain debt did not fall within ${Math.round(REPAY_TX_TIMEOUT_MS / MS_PER_SECOND)}s (before $${debtBeforeUsd.toFixed(2)}, last $${lastUsd.toFixed(2)}) — the position doesn't reflect the repayment.`,
  );
}

/** Read the position's current on-chain debt (USD), for the pre/post repay comparison. */
async function readDebtUsd(
  network: NetworkName,
  ethAddress: string,
): Promise<number | null> {
  return fetchBorrowContext(network, ethAddress)
    .then((c) => c.currentDebtUsd)
    .catch(() => null);
}

/** Drive the repay flow proper (assumes wallets connected + approver/recorder installed by the caller). */
export async function runRepayFlow(
  ctx: ActionContext,
  onStep: (step: string) => void,
): Promise<void> {
  const { page, context, log } = ctx;
  // Repay the explicit token, else (borrow-first) the token we just borrowed, else let the picker/form
  // decide (a single loan needs no token).
  const token =
    ctx.config.repayToken?.trim() ||
    ctx.config.borrowToken?.trim() ||
    undefined;

  onStep("repay-open");
  const { pickerOpened } = await openRepay(page, log);

  let symbol = token;
  if (pickerOpened) {
    onStep("repay-select-asset");
    symbol = await selectAsset(page, log, token);
  }

  onStep("repay-form");
  // Snapshot the on-chain debt BEFORE submitting so we can assert it fell afterwards (a real-data
  // post-condition on top of the UI success screen).
  const debtBeforeUsd = await readDebtUsd(ctx.config.network, ctx.eth.address);
  const amount = await resolveRepayAmount(ctx, symbol);
  await fillRepayAmount(page, log, amount);
  const cta = await waitForRepayCta(page, log);

  onStep("repay-submit");
  log(
    "Repay CTA enabled — submitting (the approver will confirm the MetaMask approve/repay tx(s))",
  );
  await cta.click();

  await confirmRepaySuccess(page, context, log, symbol);

  onStep("repay-verify");
  await assertRepayDebtDecreased(ctx, debtBeforeUsd);
}

export const repayAction: Action = {
  id: "repay",
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
          "Repay --borrow-first: borrowing before repaying" +
            (ctx.config.peginFirst
              ? " (pegging in fresh collateral first)"
              : ""),
        );
        // The borrow leg is a hard prerequisite: if it fails (e.g. the pegin/borrow tx reverts or the
        // wallet RPC errors), there is no new loan to repay, so STOP here — never fall through to the
        // repay. runBorrowWithOptionalPegin throws on any pegin/borrow failure; we catch only to log the
        // skip intent, then rethrow so the run aborts (repay is never attempted).
        try {
          await runBorrowWithOptionalPegin(ctx, (step) => {
            currentStep = `borrow:${step}`;
          });
        } catch (error) {
          log(
            "❌ Borrow leg failed — stopping the run and SKIPPING repay (no new loan was created to repay).",
          );
          throw error;
        }
      }

      await runRepayFlow(ctx, (step) => {
        currentStep = step;
      });

      log("✅ Repay complete.");
    } finally {
      await recorder.stop();
      context.off("page", handler);
    }
  },
};
