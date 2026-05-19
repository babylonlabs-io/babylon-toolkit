/**
 * Page object for the vault dApp's persistent shell: top nav, connect
 * button, theme toggle, and the route-level entry points (Applications
 * tab, Activity tab, Deposit CTA).
 *
 * Selectors prefer role+name with COPY constants so that copy edits
 * keep tests passing. Where a stable data-testid exists in source, it
 * wins. Adding new selectors here is the place to land
 * stability-improving testids in the React tree.
 */

import type { Locator, Page } from "@playwright/test";

export class AppShell {
  constructor(public readonly page: Page) {}

  async goto(path = "/"): Promise<void> {
    await this.page.goto(path);
  }

  get connectButton(): Locator {
    // Connect button in the top nav (core-ui ConnectButton). Matches
    // any button whose accessible name starts with "Connect".
    return this.page.getByRole("button", { name: /^Connect/i });
  }

  get applicationsTab(): Locator {
    return this.page.getByRole("link", { name: /Applications/i });
  }

  get activityTab(): Locator {
    return this.page.getByRole("link", { name: /Activity/i });
  }

  get depositCta(): Locator {
    // The persistent "Deposit BTC" CTA rendered in RootLayout once a
    // wallet is connected. Distinct from the in-modal "Deposit" submit.
    return this.page.getByRole("button", { name: /^Deposit BTC$/i });
  }

  async openActivity(): Promise<void> {
    await this.activityTab.click();
  }

  async openApplications(): Promise<void> {
    await this.applicationsTab.click();
  }

  async openDeposit(): Promise<void> {
    await this.depositCta.click();
  }
}
