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
