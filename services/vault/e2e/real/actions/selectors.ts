/**
 * Shared Playwright selector helpers for the dapp-driving actions (pegin, borrow, …).
 */
import type { Locator, Page } from "@playwright/test";

/**
 * The core-ui fluid `Button`'s stable class — the primary CTA in both the deposit and borrow forms.
 * Used to locate that button independently of its (label-dependent) accessible name.
 */
export const FLUID_CTA_SELECTOR = "button.bbn-btn-fluid";

// ── Deposit progress view: error states ──────────────────────────────────────────
/**
 * The DepositProgressView's recoverable-error CTA: the submit relabels to "Retry" (and calls `onRetry`)
 * whenever a step fails with a retryable error (COPY.deposit.progress.buttons.retry). It's only rendered
 * in that error state — during signing the CTA is "Sign Transaction"/processing/"Done" — so its visible
 * text is a safe, state-specific target.
 */
const RETRY_BUTTON_RX = /^retry$/i;
export function retryButton(page: Page): Locator {
  return page.getByRole("button", { name: RETRY_BUTTON_RX }).first();
}
/**
 * The same CTA when the error is not resumable (COPY.deposit.progress.buttons.close). The dialog's
 * icon-only close button carries the same accessible name, so match the one that shows the text.
 */
const CLOSE_LABEL = "Close";
export function closeCtaButton(page: Page): Locator {
  return page
    .getByRole("button", { name: CLOSE_LABEL, exact: true })
    .filter({ hasText: CLOSE_LABEL })
    .first();
}
/** The deposit flow's refusal when the position has no room (COPY.deposit.errors.positionCapacityExceeded.title). */
export const POSITION_CAPACITY_EXCEEDED_TITLE =
  "Not enough room in your position";
/** The same check without a verdict (COPY.deposit.errors.positionCapacityUnavailable.title). */
export const POSITION_CAPACITY_UNAVAILABLE_TITLE =
  "Couldn't check your position";
/**
 * The deposit's end screen when the registry redeemed a vault at activation instead of activating it
 * (COPY.deposit.vaultReturnedSuccess.full.heading / .partial.heading). It keeps the activated screen's
 * "Go to Dashboard" label, so the walk alone cannot tell the two apart.
 */
export const VAULT_RETURNED_HEADING_RX =
  /your btc is being returned|part of your deposit is being returned/i;

/**
 * Locate a control by its `data-testid` OR a tolerant fallback `Locator`, resolving to the FIRST match
 * in DOM order (`.or()` is a match-either union, not a testid priority). This works because the testid
 * (added to the src controls) and the fallback target the SAME control: on the current build both match
 * that one element; on a deployed build that predates the testid, only the fallback matches — either way
 * it resolves to that control. Keep each fallback tightly scoped to its own control so a broad fallback
 * can't match an earlier, unrelated element and win the `.first()`. The fallback is a `Locator` (not a
 * name) because it differs per site — `getByRole({name})`, `getByRole().filter({hasText})`, or a raw
 * `page.locator(...)`.
 */
export function firstByTestid(
  page: Page,
  testid: string,
  fallback: Locator,
): Locator {
  return page.locator(testid).or(fallback).first();
}

// ── Shared loan-form (Borrow / Repay) selectors ─────────────────────────────────
// The borrow and repay flows drive the SAME components — the `AmountSlider` (numeric input + Max
// button), the "Select asset" picker, and the one `LoanSuccessModal` — so these live here rather than
// being duplicated verbatim in both actions. The parts that genuinely differ (submit testid, success
// title, CTA label taxonomy) stay local to each action.

/** The "Select asset" picker title (COPY.loans.assetSelection.title). Borrow always shows it; repay only
 *  when the position has multiple loans (a single loan routes straight to the form). */
export const ASSET_SELECT_TITLE = "Select asset";
/** Per-card testid prefix in the borrow "Select asset" picker: `asset-select-row-<underlying-address-lowercase>`,
 *  one card per token. Builds that predate Select hub keyed one row per reserve by `<symbol-lowercase>`. */
export const ASSET_ROW_TESTID_PREFIX = "asset-select-row-";
/** The "Select hub" step title (COPY.loans.hub.selectTitle). Shown after Select asset only when the token is
 *  listed on more than one hub; a single-hub token opens the borrow form directly. */
export const HUB_SELECT_TITLE = "Select hub";
/** Per-row testid prefix in "Select hub": `hub-option-<reserveId>`. Every row shares the token symbol. */
export const HUB_OPTION_TESTID_PREFIX = "hub-option-";
/** Per-row testid prefix in the repay picker: `repay-option-<reserveId>`. Two debts can share a symbol. */
export const REPAY_OPTION_TESTID_PREFIX = "repay-option-";
/** Per-row testid prefix in the /loans Active Loans list: `active-loan-row-<reserveId>`, one row per reserve. */
export const ACTIVE_LOAN_ROW_TESTID_PREFIX = "active-loan-row-";
/** The AmountSlider's numeric input (`inputmode="decimal"`, placeholder "0"). */
export const AMOUNT_INPUT = 'input[inputmode="decimal"]';
/** The AmountSlider's "Max" button (a <button> whose visible text is "Max"). */
export const MAX_BUTTON_RX = /^max$/i;
/** The CLI amount keyword meaning "click the form's Max button" (`--borrow-amount`/`--repay-amount=max`). */
export const MAX_AMOUNT_KEYWORD = "max";
/** LoanSuccessModal's Done button testid (the borrow + repay variants share the modal). */
export const SUCCESS_DONE_TESTID = '[data-testid="loan-success-done-button"]';
/** LoanSuccessModal's Done button text (COPY.loans.*Success.doneButton) — the tolerant click fallback. */
export const DONE_BUTTON_RX = /^done$/i;
/** The tx-failure callout title (COPY.common.transactionFailedTitle) shown when a borrow/repay tx fails. */
export const TX_FAILED_RX = /transaction failed/i;
/** The notice for a send the wallet refused but may have broadcast (COPY.common.classifiedErrors.sendOutcomeUnknown). */
export const SEND_OUTCOME_UNKNOWN_COPY_RX = /may still have gone through/i;
/** A loan form's submit label while its mined write gets deep enough on the chain (COPY.common.confirming). */
export const CONFIRMING_LABEL_RX = /^confirming/i;
/** The callout title for a broadcast Aave write whose outcome is not known yet (COPY.common.unconfirmedTransaction.title). */
export const UNCONFIRMED_WRITE_TITLE_RX = /waiting for confirmation/i;
/**
 * The copy for an Aave write that ended without taking effect, or may have been replaced
 * (COPY.common.unconfirmedTransaction.replaced, .replacedOutcomeUnknown, .reverted).
 */
export const WRITE_NOT_EXECUTED_RX =
  /canceled or replaced|may have been replaced|reverted on-chain/i;

/**
 * The text of the loan form's "Transaction failed" callout, title and body, whitespace-collapsed: the
 * message the user was shown, so a failed run logs it. The callout is core-ui `Callout`, which renders
 * the error variant with role="alert". Empty when the callout is gone.
 */
export async function readTxFailedText(page: Page): Promise<string> {
  const callout = page
    .getByRole("alert")
    .filter({ hasText: TX_FAILED_RX })
    .first();
  return (await callout.innerText().catch(() => ""))
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Refuse to continue on a loan form opened for a different reserve than the one this run resolved. The
 * overlay carries the reserve's on-chain id in `?reserve=`, so a wrong picker click (or a UI routing bug)
 * fails here, before an amount is entered, rather than borrowing or repaying on the wrong market.
 */
export function assertOpenFormReserve(
  page: Page,
  reserveId: bigint,
  flow: "Borrow" | "Repay",
): void {
  const opened = new URL(page.url()).searchParams.get("reserve");
  if (opened !== reserveId.toString())
    throw new Error(
      `${flow}: the form opened for reserve ${opened ?? "(none)"}, not reserve ${reserveId} — refusing to continue on the wrong market.`,
    );
}
