/**
 * Shared Playwright selector helpers for the dapp-driving actions (pegin, borrow, …).
 */
import type { Locator, Page } from "@playwright/test";

/**
 * The core-ui fluid `Button`'s stable class — the primary CTA in both the deposit and borrow forms.
 * Used to locate that button independently of its (label-dependent) accessible name.
 */
export const FLUID_CTA_SELECTOR = "button.bbn-btn-fluid";

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
/** Per-row testid prefix in the "Select asset" picker: `asset-select-row-<symbol-lowercase>`. Used both
 *  to target a row by token and to read the token symbol back out of the chosen row's `data-testid`. */
export const ASSET_ROW_TESTID_PREFIX = "asset-select-row-";
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
