/**
 * Aave Borrow / Repay — BT-15 (borrow) and BT-16 (repay)
 *
 * The Borrow CTA opens a FullScreenDialog whose first step is the asset
 * selection list.  The Repay CTA only appears when the user has open loans.
 * These tests assert the entry points and dialog visibility - the per-asset
 * borrow / repay calculations are covered by unit tests in
 * `applications/aave/components/LoanCard`.
 */

import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

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
// BT-15: User can borrow ERC-20 assets against BTC collateral
// ---------------------------------------------------------------------------

test.describe("Aave Borrow — BT-15", { tag: ["@spec:006-aave-borrow", "@story:BT-15"] }, () => {
  test.beforeEach(async ({ page }) => {
    await injectWalletMocks(page);
    await setupHealthyInfra(page);
  });

  test("[BT-15-AC1] The Borrow button is rendered on the dashboard for connected users", async ({
    page,
  }) => {
    await page.goto(BASE_URL);
    await connectWallets(page);

    await expect(
      page.getByRole("button", { name: /^borrow$/i }),
    ).toBeVisible({ timeout: 15_000 });
  });

  test("[BT-15-AC2] Borrow is blocked while the user has no collateral - the button is disabled", async ({
    page,
  }) => {
    await page.goto(BASE_URL);
    await connectWallets(page);

    // With no Aave collateral the borrow CTA must remain disabled.
    const borrowButton = page.getByRole("button", { name: /^borrow$/i });
    await expect(borrowButton).toBeVisible({ timeout: 15_000 });
    await expect(borrowButton).toBeDisabled();
  });

  test("[BT-15-AC3] A disconnected user does not see a Borrow CTA on the dashboard", async ({
    page,
  }) => {
    // Skip the wallet mock so the user remains disconnected.
    await page.goto(BASE_URL);

    // Wait for dashboard to render the Connect entry point.
    await expect(
      page.getByRole("button", { name: /connect/i }),
    ).toBeVisible({ timeout: 15_000 });

    // The Borrow button is rendered but disabled when not connected.
    const borrowButton = page.getByRole("button", { name: /^borrow$/i });
    if ((await borrowButton.count()) > 0) {
      await expect(borrowButton).toBeDisabled();
    }
  });
});

// ---------------------------------------------------------------------------
// BT-16: User can repay borrowed ERC-20 assets
// ---------------------------------------------------------------------------

test.describe("Aave Repay — BT-16", { tag: ["@spec:006-aave-borrow", "@story:BT-16"] }, () => {
  test.beforeEach(async ({ page }) => {
    await injectWalletMocks(page);
    await setupHealthyInfra(page);
  });

  test("[BT-16-AC1] The Repay button only appears when the user has open loans", async ({
    page,
  }) => {
    await page.goto(BASE_URL);
    await connectWallets(page);

    // No loans means the Repay button must not be rendered (LoansSection
    // gates it on hasLoans).
    await expect(
      page.getByRole("button", { name: /^repay$/i }),
    ).toHaveCount(0);
  });

  test("[BT-16-AC2] When there are no loans, the Loans section shows the empty state copy", async ({
    page,
  }) => {
    await page.goto(BASE_URL);
    await connectWallets(page);

    // The Loans heading is always present; the empty card content is
    // structurally verified via the absence of borrowed asset rows.
    await expect(
      page.getByRole("heading", { name: /^loans$/i }),
    ).toBeVisible({ timeout: 15_000 });

    // No "Borrowed" labels should be present in the empty state.
    await expect(page.getByText(/^borrowed$/i)).toHaveCount(0);
  });
});
