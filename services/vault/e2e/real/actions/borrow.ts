/**
 * The "borrow" action: draw a borrowable token (Aave-style) against an activated BTC-Vault position,
 * end-to-end on real Sepolia. Two shapes, selected by the CLI:
 *   - REUSE (default): borrow against the depositor's existing collateral. run.ts already refused the
 *     run before the browser if there's no active collateral (fetchBorrowContext), so the /loans
 *     Borrow button is enabled as soon as we navigate there.
 *   - PEGIN-FIRST (`--pegin-first`): peg in fresh collateral first (the shared `runPeginFlow`, which
 *     ends with an active vault), then borrow — all in one browser session.
 *
 * The borrow flow itself is short and has NO multi-minute on-chain gates (unlike pegin): navigate to
 * /loans (v3 moved the loan CTAs off the dashboard — see markdown/e2e-v3/03-borrow.md) → Borrow, pick
 * the token in the "Select asset" picker, pick its hub in "Select hub" when the token is listed on more
 * than one hub, enter the amount (a conservative fraction of the real-data max, or the form's Max),
 * submit, and approve the single MetaMask transaction. Then the "Borrow successful" screen confirms it.
 * The run is pinned to one reserve id throughout: a token symbol alone can name several reserves.
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
  type BorrowReserve,
  CONSERVATIVE_BORROW_FRACTION,
  describeReserve,
  fetchBorrowableReserves,
  fetchBorrowContext,
  fetchCollateralSats,
  fetchMaxBorrow,
  matchReserve,
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
import { formatTokenAmount } from "../tokenAmount";

import { installPopupApprover, sweepApprovals } from "./approver";
import { goToSection } from "./navigation";
import { runPeginFlow } from "./pegin";
import { startRecording } from "./recording";
import {
  AMOUNT_INPUT,
  assertOpenFormReserve,
  ASSET_ROW_TESTID_PREFIX,
  ASSET_SELECT_TITLE,
  DONE_BUTTON_RX,
  firstByTestid,
  FLUID_CTA_SELECTOR,
  HUB_OPTION_TESTID_PREFIX,
  HUB_SELECT_TITLE,
  MAX_AMOUNT_KEYWORD,
  MAX_BUTTON_RX,
  readTxFailedText,
  SUCCESS_DONE_TESTID,
  TX_FAILED_RX,
} from "./selectors";
import { type Action, type ActionContext } from "./types";
import { connectWallets } from "./walletConnect";

// The /loans summary → Borrow (testid-first; the anchored fallback matches that CTA only while it reads
// exactly "Borrow", so the page's per-loan "Borrow more" row buttons can't win it). The shared loan-form
// selectors (amount input, Max button, "Select asset" title, success-modal Done, tx-failed) live in
// selectors.ts — borrow-specific ones stay here.
const LOANS_BORROW_TESTID = '[data-testid="loans-borrow-button"]';
const BORROW_BUTTON_RX = /^borrow$/i; // COPY.loans.borrowButton
const BORROW_SUBMIT_TESTID = '[data-testid="borrow-submit-button"]';
const BORROW_SUBMIT_ENABLED_LABEL = "Borrow"; // COPY.loans.borrow.action (enabled state)
// Submit labels that won't resolve by waiting — fail fast with the callout (COPY.loans.borrow.*).
// "Borrowing Unavailable" is protocol- or hub-gated; "Amount too small" / "…exceeds available liquidity" /
// "…exceeds borrow limit" are fixed properties of the entered amount + reserve (and its hub), not of how
// much collateral has propagated.
const BORROW_INSTANT_FAIL_LABELS = new Set([
  "Borrowing Unavailable",
  "Amount too small",
  "Amount exceeds available liquidity",
  "Amount exceeds borrow limit",
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
  /(minimum borrowable|maximum borrowable|available to borrow|borrow limit|health factor|temporarily unavailable|isn't accepting|has halted|Price data unavailable)[^.]*\./i;
// Success screen: the borrow-specific title (the shared Done testid/text + tx-failed live in selectors).
const BORROW_SUCCESS_RX = /borrow successful/i; // COPY.loans.borrowSuccess.title
/**
 * Minimum on-chain debt rise (USD) that counts as "the borrow landed", checked after the success
 * screen. Small — a real borrow adds far more — but above float/oracle-tick noise on the existing debt.
 */
const DEBT_INCREASE_MIN_USD = 0.01;

/** The resolved borrow amount: click the form's Max button, or fill a specific token amount. */
type BorrowAmount = { mode: "max" } | { mode: "amount"; value: string };

/** What a borrow leg did: the reserve it borrowed from and the amount it resolved. */
interface BorrowLeg {
  reserve: BorrowReserve;
  amount: BorrowAmount;
}

/**
 * Resolve the amount to borrow. An explicit `--borrow-amount` wins (a number, or `max`). Otherwise it
 * computes a conservative fraction of the real-data max — this runs after any pegin-first pegin has
 * activated, so fresh collateral is already readable. If that computation can't produce a positive
 * amount (read failed, max is 0, or the fraction rounds to 0 at the token's precision) it THROWS rather
 * than silently borrowing the form's full Max — full-max is only ever used when explicitly requested
 * via `--borrow-amount=max`, so a failed read can't pin the health factor at the liquidation edge.
 */
async function resolveBorrowAmount(
  ctx: ActionContext,
  reserve: BorrowReserve,
): Promise<BorrowAmount> {
  const raw = ctx.config.borrowAmount?.trim();
  if (raw && raw.toLowerCase() === MAX_AMOUNT_KEYWORD) return { mode: "max" };
  if (raw) return { mode: "amount", value: raw };

  const token = reserve.symbol;
  let max;
  try {
    max = await fetchMaxBorrow(
      ctx.config.network,
      ctx.eth.address,
      reserve.reserveId,
    );
  } catch (error) {
    throw new Error(
      `borrow: could not compute the max borrow for ${describeReserve(reserve)} (${error instanceof Error ? error.message : error}) — refusing to guess an amount. Re-run with an explicit --borrow-amount (or --borrow-amount=max).`,
    );
  }

  // Guard on the FORMATTED value, not raw maxTokens: 25% of a tiny max can floor to "0" at the token's
  // precision, which would fill 0 and stall at "Enter an amount". A zero/failed default fails loudly.
  const value =
    max.maxTokens > 0
      ? formatTokenAmount(
          max.maxTokens * CONSERVATIVE_BORROW_FRACTION,
          max.decimals,
        )
      : "0";
  if (Number(value) <= 0)
    throw new Error(
      `borrow: the conservative default for ${token} rounds to 0 (computed max ${formatTokenAmount(max.maxTokens, max.decimals)} ${token} is too small to borrow ${Math.round(CONSERVATIVE_BORROW_FRACTION * 100)}% of). Re-run with an explicit --borrow-amount.`,
    );
  ctx.log(
    `Borrow amount: ${value} ${max.symbol} (~${Math.round(CONSERVATIVE_BORROW_FRACTION * 100)}% of max ${formatTokenAmount(max.maxTokens, max.decimals)} ${max.symbol}).`,
  );
  return { mode: "amount", value };
}

/** Open the borrow flow: navigate to /loans, click Borrow, wait for the "Select asset" picker. */
async function openBorrow(page: Page, log: (m: string) => void): Promise<void> {
  await goToSection(page, "loans", log);
  const borrow = firstByTestid(
    page,
    LOANS_BORROW_TESTID,
    page.getByRole("button", { name: BORROW_BUTTON_RX }),
  );
  await borrow.waitFor({ state: "visible", timeout: STEP_TIMEOUT_MS });
  // The button is gated on `hasCollateral` (collateral > 0). A JUST-activated vault (pegin-first) takes
  // a moment to propagate into the app's position read, so the button can be briefly disabled right
  // after the peg-in finishes. Poll for it to enable rather than failing on the first check; only treat
  // a persistently-disabled button as "no collateral". (A reuse run already passed run.ts's collateral
  // gate, so its button is enabled almost immediately.)
  const deadline = Date.now() + BORROW_BUTTON_ENABLE_TIMEOUT_MS;
  let enabled = await borrow.isEnabled().catch(() => false);
  while (!enabled && Date.now() < deadline) {
    await page.waitForTimeout(FORM_SETTLE_MS);
    enabled = await borrow.isEnabled().catch(() => false);
  }
  if (!enabled)
    throw new Error(
      `The /loans Borrow button stayed disabled for ${Math.round(BORROW_BUTTON_ENABLE_TIMEOUT_MS / MS_PER_SECOND)}s — this position has no active BTC Vault collateral to borrow against. Peg in first (or re-run with --pegin-first).`,
    );
  log("Opening the borrow flow (/loans → Borrow)");
  await borrow.click();
  await page
    .getByText(ASSET_SELECT_TITLE, { exact: true })
    .first()
    .waitFor({ state: "visible", timeout: STEP_TIMEOUT_MS });
}

/**
 * The reserve this run borrows from. The CLI normally resolved it already (`borrowReserveId`); when its
 * reserve read failed, resolve it here the same way: the token (plus `--borrow-hub`) must match exactly
 * one borrowable reserve, and no token is accepted only when a single reserve is borrowable. One token
 * can be listed on several hubs, so a symbol alone is refused rather than resolved to whichever reserve
 * comes first.
 */
async function resolveBorrowReserve(
  ctx: ActionContext,
): Promise<BorrowReserve> {
  const { network, borrowReserveId, borrowHub } = ctx.config;
  const reserves = await fetchBorrowableReserves(network);
  if (borrowReserveId !== undefined) {
    const reserve = reserves.find(
      (r) => r.reserveId.toString() === borrowReserveId,
    );
    if (!reserve)
      throw new Error(
        `borrow: reserve ${borrowReserveId} is not borrowable on ${network}.`,
      );
    return reserve;
  }
  const token = ctx.config.borrowToken?.trim();
  if (!token) {
    if (reserves.length === 1) return reserves[0];
    throw new Error(
      reserves.length === 0
        ? `borrow: no borrowable reserves on ${network}.`
        : `borrow: no --borrow-token and more than one borrowable reserve (${reserves.map(describeReserve).join("; ")}) — re-run with --borrow-token (and --borrow-hub).`,
    );
  }
  const match = matchReserve(reserves, token, borrowHub);
  if (match.kind === "match") return match.reserve;
  throw new Error(
    match.kind === "none"
      ? `borrow: "${token}"${borrowHub ? ` on "${borrowHub}"` : ""} is not a borrowable reserve on ${network}.`
      : `borrow: "${token}" is listed on more than one hub (${match.candidates.map(describeReserve).join("; ")}) — re-run with --borrow-hub.`,
  );
}

/**
 * Pick the borrow token in "Select asset": one card per token, keyed by its underlying address. Falls
 * back to the per-reserve row keyed by symbol that builds predating Select hub render. The picker can
 * still be loading, so we WAIT for the card (not a one-shot check) and only fail on timeout.
 */
async function selectAsset(
  page: Page,
  log: (m: string) => void,
  reserve: BorrowReserve,
): Promise<void> {
  const card = firstByTestid(
    page,
    `[data-testid="${ASSET_ROW_TESTID_PREFIX}${reserve.tokenAddress.toLowerCase()}"]`,
    page.locator(
      `[data-testid="${ASSET_ROW_TESTID_PREFIX}${reserve.symbol.toLowerCase()}"]`,
    ),
  );
  const appeared = await card
    .waitFor({ state: "visible", timeout: STEP_TIMEOUT_MS })
    .then(() => true)
    .catch(() => false);
  if (!appeared)
    throw new Error(
      `Borrow token ${reserve.symbol} (${reserve.tokenAddress}) was not found in the asset picker within ${Math.round(STEP_TIMEOUT_MS / MS_PER_SECOND)}s.`,
    );
  await card.click();
  log(`Selected borrow token: ${reserve.symbol}`);
}

/**
 * Pick the hub in "Select hub". The step appears only when the token is listed on more than one hub; a
 * single-hub token (or a build that predates the step) opens the form directly, so we race the step's
 * title against the form's amount input. The row is clicked by reserve id with NO text fallback: every
 * hub row shows the same token symbol, so matching on text could pick the wrong market.
 */
async function selectHub(
  page: Page,
  log: (m: string) => void,
  reserve: BorrowReserve,
): Promise<void> {
  const hubTitle = page.getByText(HUB_SELECT_TITLE, { exact: true }).first();
  const amountInput = page.locator(AMOUNT_INPUT).first();
  const deadline = Date.now() + STEP_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (await hubTitle.isVisible().catch(() => false)) {
      const row = page.locator(
        `[data-testid="${HUB_OPTION_TESTID_PREFIX}${reserve.reserveId}"]`,
      );
      await row.waitFor({ state: "visible", timeout: STEP_TIMEOUT_MS });
      await row.click();
      await amountInput.waitFor({ state: "visible", timeout: STEP_TIMEOUT_MS });
      log(`Selected hub: ${describeReserve(reserve)}`);
      return;
    }
    if (await amountInput.isVisible().catch(() => false)) {
      log(`No hub to choose for ${reserve.symbol} — the form opened directly`);
      return;
    }
    await page.waitForTimeout(FORM_SETTLE_MS);
  }
  throw new Error(
    `Borrow: after selecting ${reserve.symbol}, neither "Select hub" nor the borrow form appeared within ${Math.round(STEP_TIMEOUT_MS / MS_PER_SECOND)}s.`,
  );
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
 * changes. An instant-fail label (protocol paused or hub blocked, amount too small, over reserve liquidity
 * or the hub's borrow limit) throws immediately with the callout. A collateral-dependent label ("Amount exceeds maximum" / "Health factor
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
 * screen, then click Done. Fails fast, with the callout's text, if the form surfaces a "Transaction
 * failed" callout.
 */
async function confirmBorrowSuccess(
  page: Page,
  context: BrowserContext,
  log: (m: string) => void,
  reserveLabel: string,
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
      log(`✅ Borrow successful (${reserveLabel}) — clicking Done`);
      await doneButton.click({ timeout: STEP_TIMEOUT_MS }).catch(() => {});
      return;
    }
    if (await txFailed.isVisible().catch(() => false)) {
      const detail = await readTxFailedText(page);
      throw new Error(
        `Borrow transaction failed${detail ? ` — the form shows "${detail}"` : ""}. See trace.zip + the failure screenshot.`,
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

/**
 * Drive the borrow flow proper (assumes wallets connected + approver/recorder installed by the caller,
 * and collateral already present). Wrapped by `runBorrowWithOptionalPegin`, which adds the optional
 * pegin-first phase in front. Returns the reserve it borrowed from and the amount, as resolved before
 * filling the form.
 */
async function runBorrowFlow(
  ctx: ActionContext,
  onStep: (step: string) => void,
): Promise<BorrowLeg> {
  const { page, context, log } = ctx;
  // Resolved before the browser flow, so an unknown or ambiguous token fails before anything is clicked.
  const reserve = await resolveBorrowReserve(ctx);
  log(`Borrowing from ${describeReserve(reserve)}`);

  onStep("borrow-open");
  await openBorrow(page, log);

  onStep("borrow-select-asset");
  await selectAsset(page, log, reserve);

  onStep("borrow-select-hub");
  await selectHub(page, log, reserve);
  assertOpenFormReserve(page, reserve.reserveId, "Borrow");

  onStep("borrow-form");
  // Snapshot the on-chain debt BEFORE submitting so we can assert it rose afterwards (a real-data
  // post-condition on top of the UI success screen).
  const debtBeforeUsd = await fetchBorrowContext(
    ctx.config.network,
    ctx.eth.address,
  )
    .then((c) => c.currentDebtUsd)
    .catch(() => null);
  const amount = await resolveBorrowAmount(ctx, reserve);
  await fillBorrowAmount(page, log, amount);
  const cta = await waitForBorrowCta(page, log);

  onStep("borrow-submit");
  log(
    "Borrow CTA enabled — submitting (the approver will confirm the MetaMask tx)",
  );
  await cta.click();

  await confirmBorrowSuccess(page, context, log, describeReserve(reserve));

  onStep("borrow-verify");
  await assertBorrowDebtIncreased(ctx, debtBeforeUsd);
  return { reserve, amount };
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

/**
 * Borrow, optionally pegging in fresh collateral first (`--pegin-first`). Assumes wallets connected +
 * approver/recorder installed by the caller. Exported so BOTH the borrow action and the repay action
 * (`repay --borrow-first [--pegin-first]`) run the identical "maybe peg in, then borrow" sequence — the
 * pegin (a full `runPeginFlow`) then the baseline-relative collateral-settle wait, then the borrow. Step
 * labels are emitted via `onStep` (the caller namespaces them for its recorder). Returns the reserve and
 * amount borrowed, so a caller can repay that reserve or check the leg on-chain against the amount.
 */
export async function runBorrowWithOptionalPegin(
  ctx: ActionContext,
  onStep: (step: string) => void,
): Promise<BorrowLeg> {
  if (ctx.config.peginFirst) {
    ctx.log("--pegin-first: pegging in fresh collateral before borrowing");
    // Snapshot the on-chain collateral BEFORE the pegin so we wait for THIS pegin's vault to register —
    // a strict increase over the baseline. That is what makes "0.01 existing + new 0.01" correct:
    // collateral may already be > 0, so we wait for it to rise past the baseline, not merely be non-zero.
    // A failed read → 0n baseline (worst case we wait for any collateral).
    const baselineSats = await fetchCollateralSats(
      ctx.config.network,
      ctx.eth.address,
    ).catch(() => 0n);
    await runPeginFlow(ctx, (step) => onStep(`pegin:${step}`));
    onStep("await-collateral");
    await waitForFreshCollateral(ctx, baselineSats);
  }
  return runBorrowFlow(ctx, onStep);
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

      await runBorrowWithOptionalPegin(ctx, (step) => {
        currentStep = step;
      });

      log("✅ Borrow complete.");
    } finally {
      await recorder.stop();
      context.off("page", handler);
    }
  },
};
