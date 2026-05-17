/**
 * Page object for the post-connect dashboard at `/`. Surfaces the
 * collateral section (active vault positions), the deposit CTA, and
 * per-vault expand / withdraw entry points.
 */

import type { Locator, Page } from "@playwright/test";

export class Dashboard {
  constructor(public readonly page: Page) {}

  async goto(): Promise<void> {
    await this.page.goto("/");
  }

  get collateralSectionHeading(): Locator {
    return this.page.getByRole("heading", { name: /Collateral/i });
  }

  get withdrawButton(): Locator {
    // Per-row withdraw entry inside the collateral list. Tests with
    // multiple positions should narrow via `vaultRow(...)` first.
    return this.page.getByRole("button", { name: /^Withdraw/i });
  }

  /** Locator for a vault row matched by visible text (vault address / id). */
  vaultRow(matcher: string | RegExp): Locator {
    return this.page.getByRole("row", { name: matcher });
  }
}
