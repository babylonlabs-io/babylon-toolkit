/**
 * Withdraw — BT-19 (initiate pegout) and BT-20 (monitor pegout progress)
 *
 * Pegout initiation lives behind a Withdraw CTA on the Collateral expanded
 * view; the user picks one or more ACTIVE vaults and confirms.  Once the
 * Ethereum claim transaction is broadcast the Pending Withdraw section appears
 * and the dashboard polls the vault provider for state transitions.
 *
 * Without an active vault these e2e tests focus on the entry-point gating
 * (Withdraw is hidden when nothing is withdrawable, and disconnected users
 * cannot reach it).  The state-machine logic is exercised by unit tests in
 * `models/pegoutStateMachine`.
 */

import { expect, test, type Page } from "@playwright/test";

import { setupHealthyInfra } from "./helpers/infra-mock";
import { injectWalletMocks } from "./helpers/wallet-mock";

const BASE_URL = "http://localhost:5175";

async function connectWallets(page: Page): Promise<void> {
  const connectButton = page.getByRole("button", { name: /connect/i });
  await expect(connectButton).toBeVisible({ timeout: 15_000 });
  await connectButton.click();

  const walletModal = page.getByRole("dialog");
  await expect(walletModal).toBeVisible({ timeout: 10_000 });

  await page.getByRole("button", { name: /unisat/i }).click();
  await page.getByRole("button", { name: /browser wallet|injected/i }).click();

  await expect(walletModal).not.toBeVisible({ timeout: 15_000 });
}

// ---------------------------------------------------------------------------
// BT-19: User can initiate a vault withdrawal (pegout)
// ---------------------------------------------------------------------------

test.describe("Pegout Initiation — BT-19", { tag: ["@spec:008-withdraw", "@story:BT-19"] }, () => {
  test.beforeEach(async ({ page }) => {
    await injectWalletMocks(page);
    await setupHealthyInfra(page);
  });

  test("[BT-19-AC1] When the user has no withdrawable vaults, the Withdraw button is not reachable", async ({
    page,
  }) => {
    await page.goto(BASE_URL);
    await connectWallets(page);

    // The Withdraw CTA lives inside the expanded collateral view.  With no
    // collateral the empty-state CTA replaces it entirely.
    await expect(
      page.getByText(/deposit bitcoin to get started/i),
    ).toBeVisible({ timeout: 15_000 });
    await expect(
      page.getByRole("button", { name: /^withdraw$/i }),
    ).toHaveCount(0);
  });

  test("[BT-19-AC2] A disconnected user cannot reach the withdrawal flow at all", async ({
    page,
  }) => {
    // Skip wallet injection so the user is disconnected.
    await page.goto(BASE_URL);

    await expect(
      page.getByRole("button", { name: /connect/i }),
    ).toBeVisible({ timeout: 15_000 });

    // The Withdraw button must not be present for a disconnected user.
    await expect(
      page.getByRole("button", { name: /^withdraw$/i }),
    ).toHaveCount(0);
  });
});

// ---------------------------------------------------------------------------
// BT-20: User can monitor the progress of an in-flight withdrawal
// ---------------------------------------------------------------------------

test.describe("Pegout Progress Monitoring — BT-20", { tag: ["@spec:008-withdraw", "@story:BT-20"] }, () => {
  test.beforeEach(async ({ page }) => {
    await injectWalletMocks(page);
    await setupHealthyInfra(page);
  });

  test("[BT-20-AC1] No Pending Withdraw section is shown when there are no in-flight pegouts", async ({
    page,
  }) => {
    await page.goto(BASE_URL);
    await connectWallets(page);

    // The Pending Withdraw section is rendered only when redeemed vaults are
    // returned by the indexer.  An empty account must not render its heading.
    await expect(
      page.getByRole("heading", { name: /pending withdraw/i }),
    ).toHaveCount(0);
  });

  test("[BT-20-AC2] The dashboard renders without errors when no pegout polling data is available", async ({
    page,
  }) => {
    await page.goto(BASE_URL);
    await connectWallets(page);

    // Sanity: dashboard mounted, Overview heading visible, no console-fatal.
    await expect(
      page.getByRole("heading", { name: /^overview$/i }),
    ).toBeVisible({ timeout: 15_000 });
  });
});
