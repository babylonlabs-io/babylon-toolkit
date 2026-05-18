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
    // Per-card withdraw entry inside the collateral list. Tests with
    // multiple positions should narrow via `vaultCard(...)` first.
    return this.page.getByRole("button", { name: /^Withdraw/i });
  }

  /**
   * Locator for a vault card matched by visible text (truncated pegin
   * tx hash, provider name, BTC amount, etc.). The collateral list
   * renders each position as a `<div>` card (see
   * `CollateralVaultItem`), not an ARIA row, so we filter by text
   * rather than `getByRole("row")`.
   */
  vaultCard(matcher: string | RegExp): Locator {
    return this.page.locator("div").filter({ hasText: matcher }).first();
  }
}
