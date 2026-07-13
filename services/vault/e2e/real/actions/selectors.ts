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
 * Locate a control testid-first with a tolerant fallback: prefer the stable `data-testid` (added to the
 * src controls), else a pre-built role/text/css `Locator` for a deployed build that predates the testid.
 * `.first()` guards against duplicates. The fallback is a `Locator` (not a name) because it differs per
 * site — `getByRole({name})`, `getByRole().filter({hasText})`, or a raw `page.locator(...)`.
 */
export function firstByTestid(
  page: Page,
  testid: string,
  fallback: Locator,
): Locator {
  return page.locator(testid).or(fallback).first();
}
