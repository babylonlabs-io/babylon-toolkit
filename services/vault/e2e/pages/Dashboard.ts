/**
 * Page object for the vaults list at `/vaults`. Exposes the vault-row
 * locator (testid-scoped to `VaultsActiveSection`'s `ActiveVaultRow`) used
 * by per-flow tests; the deposit / withdraw entry points land alongside
 * their respective flow tickets so we don't ship selectors without a
 * caller.
 */

import type { Locator, Page } from "@playwright/test";

export class Dashboard {
  constructor(public readonly page: Page) {}

  async goto(): Promise<void> {
    await this.page.goto("/vaults");
  }

  /**
   * Locator for an active-vault row matched by visible text (truncated
   * pegin tx hash, provider name, BTC amount, etc.). Scoped to the
   * `data-testid="vault-row-<vaultId>"` div emitted by `ActiveVaultRow`,
   * so the matcher only narrows among real rows instead of running
   * against every ancestor `<div>`.
   */
  vaultRow(matcher: string | RegExp): Locator {
    return this.page
      .locator('[data-testid^="vault-row-"]')
      .filter({ hasText: matcher })
      .first();
  }
}
