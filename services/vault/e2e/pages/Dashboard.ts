/**
 * Page object for the post-connect dashboard at `/`. Exposes the
 * vault-card locator (testid-scoped to `CollateralVaultItem`) used by
 * per-flow tests; the deposit / withdraw entry points land alongside
 * their respective flow tickets so we don't ship selectors without a
 * caller.
 */

import type { Locator, Page } from "@playwright/test";

export class Dashboard {
  constructor(public readonly page: Page) {}

  async goto(): Promise<void> {
    await this.page.goto("/");
  }

  /**
   * Locator for a vault card matched by visible text (truncated pegin
   * tx hash, provider name, BTC amount, etc.). Scoped to the
   * `data-testid="vault-card"` div emitted by `CollateralVaultItem`,
   * so the matcher only narrows among real cards instead of running
   * against every ancestor `<div>`.
   */
  vaultCard(matcher: string | RegExp): Locator {
    return this.page
      .getByTestId("vault-card")
      .filter({ hasText: matcher })
      .first();
  }
}
