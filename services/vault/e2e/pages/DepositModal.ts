/**
 * Page object for the deposit flow. The flow renders as a
 * `<FullScreenDialog>` from core-ui and walks through:
 *
 *   1. DepositForm   - amount + vault provider selection
 *   2. SignContent   - PSBT signing with the connected BTC wallet
 *   3. ProgressView  - broadcast + activation polling
 *
 * Locators land alongside the per-flow tickets that drive each phase
 * (#1592, #1593, #1594) - this object stays minimal here to avoid
 * scaffolding-only selectors that drift before they have a caller.
 */

import type { Locator, Page } from "@playwright/test";

export class DepositModal {
  constructor(public readonly page: Page) {}

  get dialog(): Locator {
    // FullScreenDialog renders the Radix dialog primitive with
    // role="dialog" + aria-modal. Scoping subsequent locators to the
    // dialog avoids accidental matches against shell-level CTAs of
    // the same name.
    return this.page.getByRole("dialog");
  }
}
