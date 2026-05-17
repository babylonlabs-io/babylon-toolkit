/**
 * Page object for the withdraw / redemption flow. Renders as a
 * `<FullScreenDialog>` triggered from the dashboard collateral row.
 *
 * Exposes the review-screen confirm button plus the two known
 * health-factor warning surfaces, which already have stable testids
 * in source (`withdraw-hf-block-warning`, `withdraw-hf-at-risk-warning`).
 */

import type { Locator, Page } from "@playwright/test";

export class WithdrawModal {
  constructor(public readonly page: Page) {}

  get dialog(): Locator {
    return this.page.getByRole("dialog");
  }

  get amountInput(): Locator {
    return this.dialog.getByRole("spinbutton").first();
  }

  get confirmButton(): Locator {
    return this.dialog.getByRole("button", { name: /^Confirm$/i });
  }

  get closeButton(): Locator {
    return this.dialog.getByRole("button", { name: /^(Close|Done)$/i });
  }

  get healthFactorBlockWarning(): Locator {
    return this.page.getByTestId("withdraw-hf-block-warning");
  }

  get healthFactorAtRiskWarning(): Locator {
    return this.page.getByTestId("withdraw-hf-at-risk-warning");
  }
}
