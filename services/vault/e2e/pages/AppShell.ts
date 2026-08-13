/**
 * Page object for the vault dApp's persistent shell: sidebar nav, connect
 * button, and the route-level entry points.
 *
 * Selectors prefer role+name with COPY constants so that copy edits
 * keep tests passing. Where a stable data-testid exists in source, it
 * wins. Adding new selectors here is the place to land
 * stability-improving testids in the React tree.
 */

import type { Locator, Page } from "@playwright/test";

/** Sidebar section ids, mirroring `src/config/v3Navigation.ts`. */
export type NavSection =
  | "overview"
  | "vaults"
  | "loans"
  | "activity"
  | "liquidations"
  | "explore";

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

  /**
   * A sidebar nav link, by section id (`AppSidebar`'s `nav-<id>` testid).
   * The sidebar is hidden on the disconnected entry layout, so this only
   * resolves once the app is connected or on a non-root route.
   */
  navLink(section: NavSection): Locator {
    return this.page.getByTestId(`nav-${section}`);
  }

  async openSection(section: NavSection): Promise<void> {
    await this.navLink(section).click();
  }
}
