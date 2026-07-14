/**
 * The "borrow" action: draw a borrowable token (Aave-style) against an activated BTC-Vault position,
 * end-to-end on real Sepolia. Two shapes, selected by the CLI:
 *   - REUSE (default): borrow against the depositor's existing collateral. run.ts already refused the
 *     run before the browser if there's no active collateral (fetchBorrowContext), so we land on the
 *     dashboard with the Borrow button enabled.
 *   - PEGIN-FIRST (`--pegin-first`): peg in fresh collateral first (the shared `runPeginFlow`, which
 *     ends on the dashboard with an active vault), then borrow — all in one browser session.
 *
 * The borrow flow itself is short and has NO multi-minute on-chain gates (unlike pegin): open Loans →
 * Borrow, pick the token in the "Select asset" modal, enter the amount (a conservative fraction of the
 * real-data max, or the form's Max), submit, and approve the single MetaMask transaction. Then the
 * "Borrow successful" screen confirms it.
 *
 * Selectors are testid-first (added to the src borrow controls, mirroring `activate-vault-button`) with
 * tolerant text/role/class fallbacks so a deployed build that predates the testids still works. No SDK
 * / product logic is reimplemented — the amount is a best-effort default and the live form is the
 * authoritative gate (its Max button + validation).
 *
 * NEVER run without an explicit go-ahead: it moves real value (a borrow draw, plus a full pegin when
 * `--pegin-first`).
 */
import type { BrowserContext, Locator, Page } from "@playwright/test";

import {
  CONSERVATIVE_BORROW_FRACTION,
  fetchBorrowContext,
  fetchCollateralSats,
  fetchMaxBorrow,
  formatBorrowAmount,
} from "../borrowParams";
import { formatBtc } from "../preflight";
import {
  BORROW_BUTTON_ENABLE_TIMEOUT_MS,
  BORROW_CTA_ENABLE_TIMEOUT_MS,
  BORROW_TX_TIMEOUT_MS,
  FORM_SETTLE_MS,
  FRESH_COLLATERAL_POLL_MS,
  FRESH_COLLATERAL_TIMEOUT_MS,
  MS_PER_SECOND,
  STEP_TIMEOUT_MS,
} from "../timing";

import { installPopupApprover, sweepApprovals } from "./approver";
import { runPeginFlow } from "./pegin";
import { startRecording } from "./recording";
import { FLUID_CTA_SELECTOR, firstByTestid } from "./selectors";
import { type Action, type ActionContext } from "./types";
import { connectWallets } from "./walletConnect";

// Dashboard "Loans" section → Borrow (testid-first; the fallback matches the button only while it reads
// exactly "Borrow", which is fine on the dashboard where the CTA isn't relabeled).
const LOANS_BORROW_TESTID = '[data-testid="loans-borrow-button"]';
const BORROW_BUTTON_RX = /^borrow$/i; // COPY.loans.borrowButton
const ASSET_SELECT_TITLE = "Select asset"; // COPY.loans.assetSelection.title
// Borrow form: the AmountSlider's numeric input (`inputmode="decimal"`, placeholder "0") + its Max
// button (a <button> whose visible text is "Max"), and the fluid submit button.
const AMOUNT_INPUT = 'input[inputmode="decimal"]';
const MAX_BUTTON_RX = /^max$/i;
const BORROW_SUBMIT_TESTID = '[data-testid="borrow-submit-button"]';
const BORROW_SUBMIT_ENABLED_LABEL = "Borrow"; // COPY.loans.borrow.action (enabled state)
// Submit labels that won't resolve by waiting — fail fast with the callout (COPY.loans.borrow.*).
// "Borrowing Unavailable" is protocol-gated; "Amount too small" / "…exceeds available liquidity" are
// fixed properties of the entered amount + reserve, not of how much collateral has propagated.
const BORROW_INSTANT_FAIL_LABELS = new Set([
  "Borrowing Unavailable",
  "Amount too small",
  "Amount exceeds available liquidity",
]);
// Labels that depend on the position's collateral and so can be TRANSIENT right after a pegin-first
// activation — the borrow form's max/health-factor grow as the just-activated vault propagates into
// its on-chain position read. We poll through these (not instant-fail) and only surface them if they
// persist to the enable deadline (COPY.loans.borrow.*).
const BORROW_COLLATERAL_DEPENDENT_LABELS = new Set([
  "Amount exceeds maximum",
  "Health factor too low",
]);
// Best-effort: the validation callout body phrases (COPY.loans.validation.*) + the availability ones,
// surfaced in the fail-fast message so a blocked run says why.
const CALLOUT_BODY_RX =
  /(minimum borrowable|maximum borrowable|available to borrow|health factor|temporarily unavailable|Price data unavailable)[^.]*\./i;
// Success screen (testid-first; tolerant fallbacks for a pre-testid deployed build).
const SUCCESS_DONE_TESTID = '[data-testid="loan-success-done-button"]';
const DONE_BUTTON_RX = /^done$/i; // COPY.loans.borrowSuccess.doneButton
const BORROW_SUCCESS_RX = /borrow successful/i; // COPY.loans.borrowSuccess.title
const TX_FAILED_RX = /transaction failed/i; // COPY.common.transactionFailedTitle
const MAX_AMOUNT_KEYWORD = "max";
/**
 * Minimum on-chain debt rise (USD) that counts as "the borrow landed", checked after the success
 * screen. Small — a real borrow adds far more — but above float/oracle-tick noise on the existing debt.
 */
const DEBT_INCREASE_MIN_USD = 0.01;

/** The resolved borrow amount: click the form's Max button, or fill a specific token amount. */
type BorrowAmount = { mode: "max" } | { mode: "amount"; value: string };

/**
 * Resolve the amount to borrow. An explicit `--borrow-amount` wins (a number, or `max`). Otherwise it
 * computes a conservative fraction of the real-data max — this runs after any pegin-first pegin has
 * activated, so fresh collateral is already readable. If that computation can't produce a positive
 * amount (read failed, max is 0, or the fraction rounds to 0 at the token's precision) it THROWS rather
 * than silently borrowing the form's full Max — full-max is only ever used when explicitly requested
 * via `--borrow-amount=max`, so a failed read can't pin the health factor at the liquidation edge.
 */
async function resolveBorrowAmount(ctx: ActionContext): Promise<BorrowAmount> {
  const raw = ctx.config.borrowAmount?.trim();
  if (raw && raw.toLowerCase() === MAX_AMOUNT_KEYWORD) return { mode: "max" };
  if (raw) return { mode: "amount", value: raw };

  const token = ctx.config.borrowToken?.trim();
  if (!token)
    throw new Error(
      "borrow: no --borrow-token resolved and no --borrow-amount given — cannot compute a safe default. Re-run with --borrow-token and/or --borrow-amount.",
    );

  let max;
  try {
    max = await fetchMaxBorrow(ctx.config.network, ctx.eth.address, token);
  } catch (error) {
    throw new Error(
      `borrow: could not compute the max borrow for ${token} (${error instanceof Error ? error.message : error}) — refusing to guess an amount. Re-run with an explicit --borrow-amount (or --borrow-amount=max).`,
    );
  }

  // Guard on the FORMATTED value, not raw maxTokens: 25% of a tiny max can floor to "0" at the token's
  // precision, which would fill 0 and stall at "Enter an amount". A zero/failed default fails loudly.
  const value =
    max.maxTokens > 0
      ? formatBorrowAmount(
          max.maxTokens * CONSERVATIVE_BORROW_FRACTION,
          max.decimals,
        )
      : "0";
  if (Number(value) <= 0)
    throw new Error(
      `borrow: the conservative default for ${token} rounds to 0 (computed max ${formatBorrowAmount(max.maxTokens, max.decimals)} ${token} is too small to borrow ${Math.round(CONSERVATIVE_BORROW_FRACTION * 100)}% of). Re-run with an explicit --borrow-amount.`,
    );
  ctx.log(
    `Borrow amount: ${value} ${max.symbol} (~${Math.round(CONSERVATIVE_BORROW_FRACTION * 100)}% of max ${formatBorrowAmount(max.maxTokens, max.decimals)} ${max.symbol}).`,
  );
  return { mode: "amount", value };
}

/** Open the borrow flow from the dashboard: click Loans → Borrow, wait for the "Select asset" modal. */
async function openBorrow(page: Page, log: (m: string) => void): Promise<void> {
  const borrow = firstByTestid(
    page,
    LOANS_BORROW_TESTID,
    page.getByRole("button", { name: BORROW_BUTTON_RX }),
  );
  await borrow.waitFor({ state: "visible", timeout: STEP_TIMEOUT_MS });
  // The button is gated on `hasCollateral` (collateral > 0). A JUST-activated vault (pegin-first) takes
  // a moment to propagate into the app's position read, so the button can be briefly disabled right
  // after "Go to Dashboard". Poll for it to enable rather than failing on the first check; only treat a
  // persistently-disabled button as "no collateral". (A reuse run already passed run.ts's collateral
  // gate, so its button is enabled almost immediately.)
  const deadline = Date.now() + BORROW_BUTTON_ENABLE_TIMEOUT_MS;
  let enabled = await borrow.isEnabled().catch(() => false);
  while (!enabled && Date.now() < deadline) {
    await page.waitForTimeout(FORM_SETTLE_MS);
    enabled = await borrow.isEnabled().catch(() => false);
  }
  if (!enabled)
    throw new Error(
      `The dashboard Borrow button stayed disabled for ${Math.round(BORROW_BUTTON_ENABLE_TIMEOUT_MS / MS_PER_SECOND)}s — this position has no active BTC Vault collateral to borrow against. Peg in first (or re-run with --pegin-first).`,
    );
  log("Opening the borrow flow (Loans → Borrow)");
  await borrow.click();
  await page
    .getByText(ASSET_SELECT_TITLE, { exact: true })
    .first()
    .waitFor({ state: "visible", timeout: STEP_TIMEOUT_MS });
}

/**
 * Pick the borrow token in the "Select asset" modal. Prefer the per-symbol testid; fall back to the row
 * whose text contains the symbol (case-insensitive — symbols are alphanumeric so no regex escaping is
 * needed). With no token specified, take the first asset row (testid-based; requires the testid build).
 * The modal shows "Loading assets…" until the oracle-price query resolves, so we WAIT for the row (not a
 * one-shot check) and only fail on timeout — otherwise a healthy run could race the load and see no rows.
 * Returns the symbol used, for the success log.
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
        ? `Borrow token "${token}" was not found in the asset picker within ${Math.round(STEP_TIMEOUT_MS / MS_PER_SECOND)}s.`
        : "No borrow token specified and no asset rows were found — re-run with --borrow-token=<symbol>.",
    );
  const label = (await row.innerText().catch(() => ""))
    .replace(/\s+/g, " ")
    .trim();
  await row.click();
  log(`Selected borrow token: ${token ?? label}`);
  return token ?? label;
}

/** Enter the borrow amount: click the form's Max button, or fill the numeric input. */
async function fillBorrowAmount(
  page: Page,
  log: (m: string) => void,
  amount: BorrowAmount,
): Promise<void> {
  if (amount.mode === "max") {
    log("Borrow amount: Max (clicking the form's Max button)");
    const max = page.getByRole("button", { name: MAX_BUTTON_RX }).first();
    await max.waitFor({ state: "visible", timeout: STEP_TIMEOUT_MS });
    await max.click();
  } else {
    log(`Entering borrow amount: ${amount.value}`);
    const input = page.locator(AMOUNT_INPUT).first();
    await input.waitFor({ state: "visible", timeout: STEP_TIMEOUT_MS });
    await input.fill(amount.value);
  }
  await page.waitForTimeout(FORM_SETTLE_MS);
}

/** Best-effort: read the validation/availability callout body so a blocked run explains why. */
async function readCalloutText(page: Page): Promise<string> {
  const callout = page.getByText(CALLOUT_BODY_RX).first();
  if (!(await callout.isVisible().catch(() => false))) return "";
  return (await callout.innerText().catch(() => ""))
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Wait for the fluid submit button to become the enabled "Borrow". It relabels through "Enter an
 * amount" / "Refreshing position…" while the price + position settle; we key on the stable
 * label-independent control (testid, else the fluid-button class) and read its text each tick, logging
 * changes. An instant-fail label (protocol paused, amount too small, over reserve liquidity) throws
 * immediately with the callout. A collateral-dependent label ("Amount exceeds maximum" / "Health factor
 * too low") is treated as possibly-TRANSIENT — right after a pegin-first activation the form's max grows
 * as the new vault propagates — so we keep polling and only surface it if it persists to the deadline.
 */
async function waitForBorrowCta(
  page: Page,
  log: (m: string) => void,
): Promise<Locator> {
  const cta = firstByTestid(
    page,
    BORROW_SUBMIT_TESTID,
    page.locator(FLUID_CTA_SELECTOR),
  );
  const deadline = Date.now() + BORROW_CTA_ENABLE_TIMEOUT_MS;
  let lastLabel = "";
  while (Date.now() < deadline) {
    const label = ((await cta.textContent().catch(() => "")) ?? "").trim();
    if (label && label !== lastLabel) {
      log(`Borrow CTA: "${label}"`);
      lastLabel = label;
    }
    if (BORROW_INSTANT_FAIL_LABELS.has(label)) {
      const callout = await readCalloutText(page);
      throw new Error(
        `Borrow blocked at the form: "${label}"${callout ? ` — ${callout}` : ""}`,
      );
    }
    if (
      label === BORROW_SUBMIT_ENABLED_LABEL &&
      (await cta.isEnabled().catch(() => false))
    )
      return cta;
    await page.waitForTimeout(FORM_SETTLE_MS);
  }
  // Deadline: surface the terminal label + callout. A persistent collateral-dependent label here means
  // the amount genuinely exceeds the (fully-propagated) position's capacity — not a transient.
  const callout = await readCalloutText(page);
  const stuck = BORROW_COLLATERAL_DEPENDENT_LABELS.has(lastLabel)
    ? ` — the amount still exceeds this position's capacity after waiting for collateral to settle`
    : "";
  throw new Error(
    `Borrow CTA did not become the enabled "${BORROW_SUBMIT_ENABLED_LABEL}" within ${BORROW_CTA_ENABLE_TIMEOUT_MS}ms (last label: "${lastLabel}")${stuck}${callout ? ` — ${callout}` : ""}.`,
  );
}

/**
 * After submitting, actively approve the MetaMask pop-up (the borrow is one ETH tx — the reused OKX-style
 * window needs the active sweep; MetaMask fires its own event too) and wait for the "Borrow successful"
 * screen, then click Done. Fails fast if the form surfaces a "Transaction failed" callout.
 */
async function confirmBorrowSuccess(
  page: Page,
  context: BrowserContext,
  log: (m: string) => void,
  symbol: string | undefined,
): Promise<void> {
  // Success is gated ONLY on markers specific to the borrow-success screen — the "Borrow successful"
  // title or the `loan-success-done-button` testid. NOT the generic "Done" role: deposit/withdraw/repay
  // modals also have Done buttons, so keying on any Done could report a false success. The generic-role
  // done is only the click TARGET (via firstByTestid), used after success is confirmed.
  const successTitle = page.getByText(BORROW_SUCCESS_RX).first();
  const successDone = page.locator(SUCCESS_DONE_TESTID).first();
  const doneButton = firstByTestid(
    page,
    SUCCESS_DONE_TESTID,
    page.getByRole("button", { name: DONE_BUTTON_RX }),
  );
  const txFailed = page.getByText(TX_FAILED_RX).first();
  const deadline = Date.now() + BORROW_TX_TIMEOUT_MS;
  while (Date.now() < deadline) {
    await sweepApprovals(context, page, log);

    if (
      (await successTitle.isVisible().catch(() => false)) ||
      (await successDone.isVisible().catch(() => false))
    ) {
      log(
        `✅ Borrow successful${symbol ? ` (${symbol})` : ""} — clicking Done`,
      );
      await doneButton.click({ timeout: STEP_TIMEOUT_MS }).catch(() => {});
      return;
    }
    if (await txFailed.isVisible().catch(() => false)) {
      const detail = await readCalloutText(page);
      throw new Error(
        `Borrow transaction failed${detail ? ` — ${detail}` : ""}. See trace.zip + the failure screenshot.`,
      );
    }
    await page.waitForTimeout(FORM_SETTLE_MS);
  }
  throw new Error(
    `Borrow did not reach the "Borrow successful" screen within ${BORROW_TX_TIMEOUT_MS}ms — the MetaMask transaction may not have confirmed. See trace.zip + the failure screenshot.`,
  );
}

/**
 * After the success screen, verify on-chain that the position's debt actually rose — the UI "Borrow
 * successful" alone doesn't prove funds moved. Polls `fetchBorrowContext` (on-chain `getUserAccountData`)
 * until the debt exceeds the pre-borrow baseline. Same baseline pattern as `waitForFreshCollateral`.
 * Skipped (with a warning) only if the pre-borrow baseline couldn't be read — never silently passes.
 */
async function assertBorrowDebtIncreased(
  ctx: ActionContext,
  debtBeforeUsd: number | null,
): Promise<void> {
  if (debtBeforeUsd == null) {
    ctx.log(
      "⚠️ Skipping the on-chain debt check — couldn't read the pre-borrow debt to compare against.",
    );
    return;
  }
  const deadline = Date.now() + BORROW_TX_TIMEOUT_MS;
  let lastUsd = debtBeforeUsd;
  while (Date.now() < deadline) {
    const context = await fetchBorrowContext(
      ctx.config.network,
      ctx.eth.address,
    ).catch(() => null);
    if (context) {
      lastUsd = context.currentDebtUsd;
      if (lastUsd > debtBeforeUsd + DEBT_INCREASE_MIN_USD) {
        ctx.log(
          `✅ On-chain debt rose: $${debtBeforeUsd.toFixed(2)} → $${lastUsd.toFixed(2)}.`,
        );
        return;
      }
    }
    await ctx.page.waitForTimeout(FRESH_COLLATERAL_POLL_MS);
  }
  throw new Error(
    `Borrow reached the success screen but on-chain debt did not rise within ${Math.round(BORROW_TX_TIMEOUT_MS / MS_PER_SECOND)}s (before $${debtBeforeUsd.toFixed(2)}, last $${lastUsd.toFixed(2)}) — the position doesn't reflect the new debt.`,
  );
}

/** Drive the borrow flow proper (assumes wallets connected + approver/recorder installed by the caller). */
async function runBorrowFlow(
  ctx: ActionContext,
  onStep: (step: string) => void,
): Promise<void> {
  const { page, context, log } = ctx;
  const token = ctx.config.borrowToken?.trim() || undefined;

  onStep("borrow-open");
  await openBorrow(page, log);

  onStep("borrow-select-asset");
  const symbol = await selectAsset(page, log, token);

  onStep("borrow-form");
  // Snapshot the on-chain debt BEFORE submitting so we can assert it rose afterwards (a real-data
  // post-condition on top of the UI success screen).
  const debtBeforeUsd = await fetchBorrowContext(
    ctx.config.network,
    ctx.eth.address,
  )
    .then((c) => c.currentDebtUsd)
    .catch(() => null);
  const amount = await resolveBorrowAmount(ctx);
  await fillBorrowAmount(page, log, amount);
  const cta = await waitForBorrowCta(page, log);

  onStep("borrow-submit");
  log(
    "Borrow CTA enabled — submitting (the approver will confirm the MetaMask tx)",
  );
  await cta.click();

  await confirmBorrowSuccess(page, context, log, symbol);

  onStep("borrow-verify");
  await assertBorrowDebtIncreased(ctx, debtBeforeUsd);
}

/**
 * pegin-first only: wait for the just-activated vault's collateral to register on-chain BEFORE
 * borrowing. The vault is shown active optimistically, but the borrow max is derived from the on-chain
 * position, which lags — so borrowing immediately (especially an amount sized for the new collateral)
 * would be rejected as over-max. We poll the adapter position's BTC collateral (sats — exact and
 * price-independent) until it rises STRICTLY above the pre-pegin baseline, i.e. the new vault (fresh, or
 * a second vault added to an existing position) has been counted. Non-fatal on timeout: the borrow
 * form's own CTA wait still gates the amount, so this is an explicit + logged settle, not a hard gate.
 */
async function waitForFreshCollateral(
  ctx: ActionContext,
  baselineSats: bigint,
): Promise<void> {
  ctx.log(
    `Waiting for the new collateral to register on-chain (baseline ${formatBtc(baselineSats)})…`,
  );
  const deadline = Date.now() + FRESH_COLLATERAL_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const sats = await fetchCollateralSats(
      ctx.config.network,
      ctx.eth.address,
    ).catch(() => null);
    if (sats != null && sats > baselineSats) {
      ctx.log(
        `✅ New collateral registered on-chain: ${formatBtc(baselineSats)} → ${formatBtc(sats)}.`,
      );
      return;
    }
    await ctx.page.waitForTimeout(FRESH_COLLATERAL_POLL_MS);
  }
  ctx.log(
    `⚠️ New collateral hadn't registered on-chain within ${Math.round(FRESH_COLLATERAL_TIMEOUT_MS / MS_PER_SECOND)}s — proceeding; the borrow form's CTA wait will gate the amount.`,
  );
}

export const borrowAction: Action = {
  id: "borrow",
  async run(ctx: ActionContext): Promise<void> {
    const { page, context, log, artifactsDir } = ctx;

    // One approver + one recorder for the WHOLE run — including the optional pegin phase — so a
    // pegin-first borrow keeps a single set across both (see runPeginFlow's contract).
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

      if (ctx.config.peginFirst) {
        log(
          "Borrow --pegin-first: pegging in fresh collateral before borrowing",
        );
        // Snapshot the on-chain collateral BEFORE the pegin so we can wait for THIS pegin's vault to
        // register — a strict increase over the baseline. This is what makes "0.01 existing + new 0.01"
        // correct: collateral is already > 0, so we must wait for it to rise past the baseline, not just
        // be non-zero. A failed read → 0n baseline (worst case we wait for any collateral).
        const baselineSats = await fetchCollateralSats(
          ctx.config.network,
          ctx.eth.address,
        ).catch(() => 0n);
        await runPeginFlow(ctx, (step) => {
          currentStep = `pegin:${step}`;
        });
        currentStep = "borrow-await-collateral";
        await waitForFreshCollateral(ctx, baselineSats);
      }

      await runBorrowFlow(ctx, (step) => {
        currentStep = step;
      });

      log("✅ Borrow complete.");
    } finally {
      await recorder.stop();
      context.off("page", handler);
    }
  },
};
