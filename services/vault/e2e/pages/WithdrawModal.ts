/**
 * Page object for the withdraw / redemption flow. Renders as a
 * `<FullScreenDialog>` triggered from the dashboard collateral row.
 *
 * The two health-factor warning surfaces already have stable testids
 * in source (`withdraw-hf-block-warning`, `withdraw-hf-at-risk-warning`)
 * and are surfaced here because per-flow tests assert against them
 * directly. Everything else lands with the per-flow withdraw ticket.
 */

import type { Locator, Page } from "@playwright/test";

export class WithdrawModal {
  constructor(public readonly page: Page) {}

  get dialog(): Locator {
    return this.page.getByRole("dialog");
  }

  get healthFactorBlockWarning(): Locator {
    return this.page.getByTestId("withdraw-hf-block-warning");
  }

  get healthFactorAtRiskWarning(): Locator {
    return this.page.getByTestId("withdraw-hf-at-risk-warning");
  }
}
